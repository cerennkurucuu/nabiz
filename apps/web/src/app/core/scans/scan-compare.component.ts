import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ScanService, scanErrorMessage } from './scan.service';
import type {
  ScanComparison,
  ScanJob,
} from '../../../../../../packages/contracts/api';

@Component({
  selector: 'app-scan-compare',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './scan-compare.component.html',
  styleUrl: './scan-compare.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanCompareComponent {
  private readonly scans = inject(ScanService);

  readonly jobs = input<ScanJob[]>([]);
  readonly selectedId = input<string | null>(null);

  readonly beforeId = signal('');
  readonly afterId = signal('');
  readonly compareUrl = signal('');
  readonly comparison = signal<ScanComparison | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);

  // Karşılaştırma kronolojik sırada sunulur: önceki tarama daha eski olmalıdır.
  readonly candidates = computed(() =>
    this.jobs()
      .filter((job) => job.status === 'completed')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );

  readonly afterCandidates = computed(() => {
    const before = this.candidates().find((job) => job.id === this.beforeId());
    if (!before) return this.candidates();
    return this.candidates().filter((job) => job.createdAt > before.createdAt);
  });

  readonly compareUrls = computed(() => {
    const before = this.jobs().find((job) => job.id === this.beforeId());
    const after = this.jobs().find((job) => job.id === this.afterId());
    if (!before || !after) return [];
    return before.urls.filter((url) => after.urls.includes(url));
  });

  readonly canCompare = computed(
    () =>
      Boolean(this.beforeId()) &&
      Boolean(this.afterId()) &&
      this.compareUrls().includes(this.compareUrl()),
  );

  onBefore(value: string) {
    this.beforeId.set(value);
    if (!this.afterCandidates().some((job) => job.id === this.afterId()))
      this.afterId.set('');
    this.syncUrl();
  }

  onAfter(value: string) {
    this.afterId.set(value);
    this.syncUrl();
  }

  compare() {
    if (!this.canCompare()) return;
    this.error.set('');
    this.loading.set(true);
    this.scans
      .compare(this.beforeId(), this.afterId(), this.compareUrl())
      .subscribe({
        next: (result) => {
          this.comparison.set(result);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(scanErrorMessage(error));
          this.loading.set(false);
        },
      });
  }

  private syncUrl() {
    const urls = this.compareUrls();
    if (!urls.includes(this.compareUrl())) this.compareUrl.set(urls[0] ?? '');
  }
}
