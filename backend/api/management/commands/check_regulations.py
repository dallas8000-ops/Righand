from django.core.management.base import BaseCommand

from api.regulation_monitor import run_checks


class Command(BaseCommand):
    help = 'Fetch official regulation sources and record detected changes (pending review).'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Check every source now, ignoring the interval.')

    def handle(self, *args, **options):
        results = run_checks(force=options['force'])
        if not results:
            self.stdout.write('No sources were due.')
        for result in results:
            suffix = ' (NEW UPDATE)' if result['newUpdate'] else ''
            self.stdout.write(f"{result['source']}: {result['status']}{suffix}")
