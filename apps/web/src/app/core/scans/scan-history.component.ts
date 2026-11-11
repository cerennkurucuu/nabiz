import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { DatePipe } from '@angular/common';
import type { ScanJob } from '../../../../../../packages/contracts/api';
import { scanStatusLabel } from './scan.report';

@Component({
  selector: 'app-scan-history',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
  ],
  templateUrl: './scan-history.component.html',
  styleUrl: './scan-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanHistoryComponent {
  readonly jobs = input<ScanJob[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly loading = input(false);
  readonly opened = output<ScanJob>();
  readonly cancelled = output<ScanJob>();

  readonly statusFilter = signal('');
  readonly query = signal('');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);

  readonly statuses = [
    { value: '', label: 'Tüm durumlar' },
    { value: 'completed', label: 'Tamamlandı' },
    { value: 'running', label: 'Taranıyor' },
    { value: 'queued', label: 'Kuyrukta' },
    { value: 'failed', label: 'Başarısız' },
    { value: 'cancelled', label: 'İptal edildi' },
  ];

  readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.jobs().filter((job) => {
      if (this.statusFilter() && job.status !== this.statusFilter())
        return false;
      if (!query) return true;
      return job.urls.join(' ').toLowerCase().includes(query);
    });
  });

  readonly paged = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  onPage(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  onStatus(value: string) {
    this.statusFilter.set(value);
    this.pageIndex.set(0);
  }

  onQuery(value: string) {
    this.query.set(value);
    this.pageIndex.set(0);
  }

  statusLabel(status: string) {
    return scanStatusLabel(status);
  }
}
