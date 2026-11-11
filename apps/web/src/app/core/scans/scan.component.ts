import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, finalize } from 'rxjs';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import {
  ScanService,
  scanErrorMessage,
  TERMINAL_STATUSES,
} from './scan.service';
import { ScanFormComponent } from './scan-form.component';
import { ScanHistoryComponent } from './scan-history.component';
import { ScanCompareComponent } from './scan-compare.component';
import { ScanReportComponent } from './scan-report.component';
import { scanErrorLabel, scanStatusLabel } from './scan.report';
import type { ScanView } from './scan.view';
import type {
  ScanCapabilities,
  ScanJob,
} from '../../../../../../packages/contracts/api';

@Component({
  selector: 'app-scan-panel',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ScanFormComponent,
    ScanHistoryComponent,
    ScanCompareComponent,
    ScanReportComponent,
  ],
  templateUrl: './scan.component.html',
  styleUrl: './scan.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanComponent {
  private readonly scans = inject(ScanService);
  private readonly destroyRef = inject(DestroyRef);

  readonly capabilities = signal<ScanCapabilities | null>(null);
  readonly jobs = signal<ScanJob[]>([]);
  readonly selected = signal<ScanJob | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly noticeTone = signal<'success' | 'warning'>('success');
  readonly starting = signal(false);
  readonly loading = signal(true);
  readonly reportLoading = signal(false);

  /** Hangi görünümün açık olduğunu üst kabuk yönetir. */
  readonly view = input<ScanView>('panel');
  readonly viewChange = output<ScanView>();

  readonly activeJob = computed(() => {
    const selected = this.selected();
    if (selected && ['queued', 'running'].includes(selected.status))
      return selected;
    return (
      this.jobs().find((job) => ['queued', 'running'].includes(job.status)) ??
      null
    );
  });

  readonly scanningDisabled = computed(
    () => this.capabilities()?.enabled === false,
  );

  readonly completedJobs = computed(() =>
    this.jobs().filter((job) => job.status === 'completed'),
  );

  readonly latestJob = computed(() => this.jobs()[0] ?? null);

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.scans
      .capabilities()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (response) => this.capabilities.set(response.data),
        error: (error) => this.error.set(scanErrorMessage(error)),
      });
    this.refreshHistory();
  }

  refreshHistory() {
    this.scans
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (jobs) => this.jobs.set(jobs),
        error: (error) => this.error.set(scanErrorMessage(error)),
      });
  }

  async start(urls: string[]) {
    if (this.starting()) return;
    this.error.set('');
    this.notice.set('');
    this.starting.set(true);
    try {
      const job = await firstValueFrom(this.scans.create(urls));
      this.selected.set(job);
      this.watch(job.id);
      this.refreshHistory();
    } catch (error) {
      this.error.set(scanErrorMessage(error));
    } finally {
      this.starting.set(false);
    }
  }

  watch(id: string) {
    this.scans
      .watch(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.selected.set(job);
          if (TERMINAL_STATUSES.includes(job.status)) {
            this.refreshHistory();
            this.announceResult(job);
            if (job.status === 'completed') this.viewChange.emit('report');
          }
        },
        error: (error) => {
          this.error.set(scanErrorMessage(error));
          this.refreshHistory();
        },
      });
  }

  // Analiz edilemeyen taramalar başarı gibi gösterilmez.
  private announceResult(job: ScanJob) {
    if (job.status === 'cancelled') {
      this.noticeTone.set('warning');
      this.notice.set('Tarama iptal edildi.');
      return;
    }
    if (job.status === 'failed') {
      this.noticeTone.set('warning');
      this.notice.set(
        `Tarama başarısız oldu. ${scanErrorLabel(job.error)}`.trim(),
      );
      return;
    }
    const pages = job.result?.pages ?? [];
    const analyzed = pages.filter(
      (page) => page.access !== 'blocked' && page.access !== 'unavailable',
    ).length;
    if (!analyzed) {
      this.noticeTone.set('warning');
      this.notice.set(
        'Tarama sona erdi — analiz tamamlanamadı. Sayfaya erişilemediği için kalite değerlendirmesi yapılmadı.',
      );
      return;
    }
    this.noticeTone.set('success');
    this.notice.set(
      analyzed === pages.length
        ? 'Tarama tamamlandı.'
        : `Tarama tamamlandı — ${analyzed}/${pages.length} görünüm analiz edildi.`,
    );
  }

  open(job: ScanJob) {
    this.error.set('');
    this.reportLoading.set(true);
    this.scans
      .get(job.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.reportLoading.set(false)),
      )
      .subscribe({
        next: (detail) => {
          this.selected.set(detail);
          this.viewChange.emit('report');
        },
        error: (error) => this.error.set(scanErrorMessage(error)),
      });
  }

  cancel(job: ScanJob) {
    this.error.set('');
    this.scans
      .cancel(job.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.selected.set(updated);
          this.refreshHistory();
          this.noticeTone.set('warning');
          this.notice.set('Tarama iptal edildi.');
        },
        error: (error) => this.error.set(scanErrorMessage(error)),
      });
  }

  statusLabel(status: string) {
    return scanStatusLabel(status);
  }

  errorLabel(code: string | null) {
    return scanErrorLabel(code);
  }
}
