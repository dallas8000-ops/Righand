from unittest import mock

from django.test import TestCase

from api import regulation_monitor as monitor
from api.models import RegulationSource, RegulationUpdate, _iso_utc
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
PAGE_NEWS_ONLY = PAGE_V1.replace(
    '</body>',
    '<p>Government Helps Families Affected by Koboko-Yumbe-Moyo Road Project Get New Homes</p>'
    '<p>Bid Notice Under Open Domestic Bidding: Provision of Hotel Services Under Framework Contract</p></body>',
)


class RelevanceTests(TestCase):
    def test_regulatory_wording_is_relevant(self):
        for line in (
            'The Roads (Vehicle Dimensions, Vehicle Load Control and Enforcement Measures) Regulations 2026',
            'New axle load limits published for heavy goods vehicles',
            'Special load permits now issued online by the Ministry',
            'Implementation of the 2022 Harmonized System and Common External Tariff',
            'Traffic and Road Safety (Amendment) Act, 2026',
            'COMESA Yellow Card requirements updated for cross-border cargo',
        ):
            self.assertTrue(monitor.is_regulatory(line), line)

    def test_news_and_tenders_are_not_relevant(self):
        for line in (
            'Government Helps Families Affected by Koboko-Yumbe-Moyo Road Project Get New Homes',
            'Minister Magandah Pledges Follow-Up on Delayed Compensation for Project-Affected Persons',
            'Support us to improve the Water Transport Act',
            'Bid Notice Under Open Domestic Bidding: Provision of Hotel Services Under Framework Contract',
            'Tender for supply of office stationery and printer toner for the Ministry',
        ):
            self.assertFalse(monitor.is_regulatory(line), line)

    def test_tender_wording_wins_even_with_a_regulatory_word(self):
        self.assertFalse(monitor.is_regulatory('Tender for supply of weighbridge spare parts'))

    def test_sitemap_source_skips_the_wording_filter(self):
        ntsa = next(s for s in monitor.REGULATION_SOURCES if s['id'] == 'ke-ntsa')
        added, removed = monitor.relevant_changes(['https://ntsa.go.ke/news/19'], [], ntsa)
        self.assertEqual(added, ['https://ntsa.go.ke/news/19'])


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
    def test_naive_database_timestamps_are_treated_as_utc(self):
        from datetime import datetime
        naive = datetime(2026, 10, 18, 10, 19, 24)
        aware = monitor._aware(naive)
        self.assertIsNotNone(aware.tzinfo)
        self.assertEqual(aware.utcoffset().total_seconds(), 0)
        self.assertTrue(aware < monitor.timezone.now())
        self.assertTrue(_iso_utc(naive).endswith('+00:00'))
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

    def test_news_only_change_is_kept_as_site_news_and_not_reported_as_a_regulation_change(self):
        self._check(PAGE_V1)
        news = self._check(PAGE_NEWS_ONLY)
        self.assertIsNotNone(news)
        self.assertEqual(news.status, 'site_news')
        self.assertIn('Koboko', news.added_text)
        source = RegulationSource.objects.get(pk=self.source.pk)
        self.assertEqual(source.last_status, 'news')
        self.assertEqual(RegulationUpdate.objects.filter(status='pending_review').count(), 0)
        # The same news is not reported again on the next check.
        self.assertIsNone(self._check(PAGE_NEWS_ONLY))
        self.assertEqual(RegulationUpdate.objects.count(), 1)

    def test_a_real_change_is_never_hidden_by_news_on_the_same_page(self):
        self._check(PAGE_V1)
        update = self._check(PAGE_V2.replace('</body>', '<p>Koboko-Yumbe-Moyo road project news item for today.</p></body>'))
        self.assertEqual(update.status, 'pending_review')
        self.assertIn('axle load amendment', update.added_text)

    @mock.patch.dict('os.environ', {'REGULATION_MONITOR_ENABLED': '0'})
    def test_payload_separates_regulation_changes_from_site_news(self):
        from api.views.regulations import regulation_monitor_payload
        self._check(PAGE_V1)
        self._check(PAGE_NEWS_ONLY)
        payload = regulation_monitor_payload('UG')
        self.assertEqual(payload['updates'], [])
        self.assertEqual(payload['pendingCount'], 0)
        self.assertEqual(len(payload['siteNews']), 1)
        self.assertEqual(payload['siteNews'][0]['status'], 'site_news')

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
