from unittest import mock

from django.test import TestCase

from api import regulation_monitor as monitor
from api.models import RegulationSource, RegulationUpdate
from api.schema_migrations import ensure_core_schema

PAGE_V1 = """
<html><head><title>x</title></head><body>
<nav><a href="/">Home navigation link that is long enough</a></nav>
<h2>Vehicle Dimensions and Load Control Regulations 2026</h2>
<p>Gross vehicle mass limits are published by the Ministry of Works.</p>
<p>Weighbridge operators must issue a ticket for every overload notice.</p>
<p>Special load permits are issued for abnormal loads on request.</p>
<p>Applications for permits are processed within ten working days.</p>
<script>var ignored = 'this script text must never be treated as page content';</script>
</body></html>
"""
PAGE_V2 = PAGE_V1.replace('</body>', '<p>New axle load amendment notice published for 2027 season.</p></body>')


class ExtractTests(TestCase):
    def test_skips_script_and_nav(self):
        lines = monitor.extract_lines(PAGE_V1)
        joined = ' '.join(lines)
        self.assertIn('Vehicle Dimensions and Load Control Regulations 2026', joined)
        self.assertNotIn('must never be treated', joined)
        self.assertNotIn('Home navigation', joined)

    def test_diff_lines(self):
        added, removed = monitor.diff_lines(['a' * 25, 'b' * 25], ['b' * 25, 'c' * 25])
        self.assertEqual(added, ['c' * 25])
        self.assertEqual(removed, ['a' * 25])

    def test_sitemap_urls_ignore_lastmod_and_duplicates(self):
        xml = (
            '<urlset><url><loc>https://ntsa.go.ke/news/19</loc><lastmod>2026-10-18T08:37:25+00:00</lastmod></url>'
            '<url><loc> https://ntsa.go.ke/news/17 </loc></url>'
            '<url><loc>https://ntsa.go.ke/news/19</loc></url></urlset>'
        )
        self.assertEqual(
            monitor.extract_sitemap_urls(xml),
            ['https://ntsa.go.ke/news/19', 'https://ntsa.go.ke/news/17'],
        )

    def test_ntsa_source_uses_sitemap_mode_and_bundled_cert(self):
        ntsa = next(s for s in monitor.REGULATION_SOURCES if s['id'] == 'ke-ntsa')
        self.assertEqual(ntsa['mode'], 'sitemap')
        self.assertTrue((monitor.CERT_DIR / ntsa['caFile']).exists())


class CheckSourceTests(TestCase):
    def setUp(self):
        ensure_core_schema()
        monitor.sync_sources()
        self.source = RegulationSource.objects.get(pk='ug-works-policies')

    def _check(self, html):
        with mock.patch.object(monitor, 'fetch_lines', return_value=monitor.extract_lines(html)):
            return monitor.check_source(RegulationSource.objects.get(pk=self.source.pk))

    def test_first_run_is_baseline_without_update(self):
        self.assertIsNone(self._check(PAGE_V1))
        self.assertEqual(RegulationSource.objects.get(pk=self.source.pk).last_status, 'baseline')
        self.assertEqual(RegulationUpdate.objects.count(), 0)

    def test_unchanged_page_creates_no_update(self):
        self._check(PAGE_V1)
        self.assertIsNone(self._check(PAGE_V1))
        self.assertEqual(RegulationSource.objects.get(pk=self.source.pk).last_status, 'unchanged')

    def test_change_creates_pending_update_with_diff_summary(self):
        self._check(PAGE_V1)
        update = self._check(PAGE_V2)
        self.assertIsNotNone(update)
        self.assertEqual(update.status, 'pending_review')
        self.assertEqual(update.summary_mode, 'diff')
        self.assertIn('axle load amendment', update.added_text)

    def test_unreadable_page_is_flagged_not_changed(self):
        self._check(PAGE_V1)
        self.assertIsNone(self._check('<html><body><div id="app"></div></body></html>'))
        source = RegulationSource.objects.get(pk=self.source.pk)
        self.assertEqual(source.last_status, 'unreadable')
        self.assertEqual(RegulationUpdate.objects.count(), 0)

    def test_fetch_error_is_recorded(self):
        with mock.patch.object(monitor, 'fetch_lines', side_effect=RuntimeError('boom')):
            self.assertIsNone(monitor.check_source(RegulationSource.objects.get(pk=self.source.pk)))
        source = RegulationSource.objects.get(pk=self.source.pk)
        self.assertEqual(source.last_status, 'error')
        self.assertIn('boom', source.last_error)

    def test_changed_url_resets_snapshot_and_schedule(self):
        ntsa = RegulationSource.objects.get(pk='ke-ntsa')
        ntsa.url = 'https://ntsa.go.ke/'
        ntsa.content_hash = 'old'
        ntsa.snapshot_text = 'old'
        ntsa.last_checked_at = monitor.timezone.now()
        ntsa.save()
        monitor.sync_sources()
        ntsa.refresh_from_db()
        self.assertEqual(ntsa.url, 'https://ntsa.go.ke/sitemap.xml')
        self.assertIsNone(ntsa.content_hash)
        self.assertIsNone(ntsa.last_checked_at)

    def test_run_checks_skips_recently_checked_sources(self):
        with mock.patch.object(monitor, 'fetch_lines', return_value=monitor.extract_lines(PAGE_V1)) as fetch:
            first = monitor.run_checks()
            second = monitor.run_checks()
        self.assertEqual(len(first), len(monitor.REGULATION_SOURCES))
        self.assertEqual(second, [])
        self.assertEqual(fetch.call_count, len(monitor.REGULATION_SOURCES))
