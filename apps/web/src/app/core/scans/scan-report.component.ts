import {
  ChangeDetectionStrategy,
  ElementRef,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { API_BASE_URL } from '../api/api.service';
import type {
  ScanCheck,
  ScanFinding,
  ScanJob,
  ScanPageReport,
} from '../../../../../../packages/contracts/api';
import {
  buildRecommendations,
  CATEGORY_LABELS,
  checksForSection,
  emptyFilters,
  engineLabel,
  engineReports,
  engineStatusLabel,
  filterFindings,
  findingsForSection,
  hasCheckResults,
  pageArtifacts,
  pageSpeedErrorLabel,
  pageSpeedStrategyLabel,
  REPORT_SECTIONS,
  RULE_LABELS,
  scanErrorLabel,
  scanStatusLabel,
  SEVERITY_LABELS,
  sortChecks,
  summarizeChecks,
  summarizeScan,
  CHECK_STATUS_LABELS,
  type FindingFilters,
  type ReportSectionId,
} from './scan.report';

interface ReportFinding extends ScanFinding {
  viewport: string;
  pageUrl: string;
}

interface ArtifactEntry {
  id: string;
  url: string;
  label: string;
  kind: string;
  viewport: string;
  pageUrl: string;
}

const PAGE_LIMIT = 25;

@Component({
  selector: 'app-scan-report',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './scan-report.component.html',
  styleUrl: './scan-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanReportComponent {
  private readonly baseUrl = inject(API_BASE_URL).replace(/\/$/, '');

  readonly job = input<ScanJob | null>(null);
  readonly loading = input(false);

  readonly filters = signal<FindingFilters>(emptyFilters());
  readonly visibleCounts = signal<Record<string, number>>({});
  readonly viewport = signal('');
  readonly urlFilter = signal('');
  readonly statusFilter = signal('');
  readonly zoomed = signal<ArtifactEntry | null>(null);

  readonly sections = REPORT_SECTIONS;
  readonly groupElements =
    viewChildren<ElementRef<HTMLDetailsElement>>('groupElement');

  readonly severityOptions = [
    { value: '', label: 'Tüm önem dereceleri' },
    { value: 'error', label: 'Hata' },
    { value: 'warning', label: 'Uyarı' },
    { value: 'info', label: 'Bilgi' },
  ];
  readonly categoryOptions = [
    { value: '', label: 'Tüm kategoriler' },
    { value: 'technical', label: 'Teknik' },
    { value: 'ui', label: 'UI/UX' },
    { value: 'accessibility', label: 'Erişilebilirlik' },
    { value: 'seo', label: 'SEO' },
  ];
  readonly ruleOptions = [
    { value: '', label: 'Tüm kurallar' },
    { value: 'T01', label: 'T01 · JavaScript hatası' },
    { value: 'T02', label: 'T02 · Başarısız kaynak' },
    { value: 'T03', label: 'T03 · İç bağlantı' },
    { value: 'T04', label: 'T04 · Görsel' },
    { value: 'U02', label: 'U02 · Yatay taşma' },
    { value: 'U10', label: 'U10 · Viewport dışı içerik' },
    { value: 'U11', label: 'U11 · Kırpılan içerik' },
    { value: 'U12', label: 'U12 · Dokunma hedefi' },
    { value: 'U13', label: 'U13 · Yakın etkileşim öğeleri' },
    { value: 'U14', label: 'U14 · Yazı boyutu' },
    { value: 'U15', label: 'U15 · Erişilebilir isim' },
    { value: 'U16', label: 'U16 · Odak göstergesi' },
    { value: 'U17', label: 'U17 · Responsive bozulma' },
    { value: 'X01', label: 'X01 · Erişilebilir etiket' },
    { value: 'A02', label: 'A02 · Metin kontrastı' },
    { value: 'A03', label: 'A03 · Büyük metin kontrastı' },
    { value: 'A06', label: 'A06 · Görsel alt metni' },
    { value: 'S01', label: 'S01 · Sayfa başlığı' },
    { value: 'S02', label: 'S02 · Meta açıklama' },
    { value: 'S05', label: 'S05 · Canonical' },
    { value: 'S08', label: 'S08 · Viewport meta' },
    { value: 'S14', label: 'S14 · JSON-LD' },
  ];
  readonly viewportOptions = [
    { value: '', label: 'Tüm görünümler' },
    { value: 'desktop', label: 'Masaüstü' },
    { value: 'mobile', label: 'Mobil' },
  ];
  readonly statusOptions = [
    { value: '', label: 'Tüm kontrol durumları' },
    { value: 'passed', label: 'Geçti' },
    { value: 'failed', label: 'Sorun bulundu' },
    { value: 'inconclusive', label: 'Doğrulanamadı' },
    { value: 'skipped', label: 'Çalıştırılmadı' },
  ];

  readonly pages = computed<ScanPageReport[]>(
    () => this.job()?.result?.pages ?? [],
  );

  readonly summary = computed(() => summarizeScan(this.job()));

  readonly checks = computed<ScanCheck[]>(() =>
    sortChecks(this.job()?.result?.checks ?? []),
  );

  readonly checkTotals = computed(() => summarizeChecks(this.checks()));

  readonly hasChecks = computed(() =>
    hasCheckResults(this.job()?.result ?? null),
  );

  readonly pageSpeed = computed(() => this.job()?.result?.pageSpeed ?? []);

  /** Motor durumları; hangi motorun neden çalışmadığı burada görünür. */
  readonly engines = computed(() => engineReports(this.job()?.result ?? null));

  readonly hasEngines = computed(() => this.engines().length > 0);

  /** API anahtarı yapılandırılmış mı; yapılandırma uyarısı bu değere bağlı. */
  readonly pageSpeedKeyConfigured = computed(
    () => this.pageSpeed().some((item) => item.apiKeyConfigured) || false,
  );

  readonly checkStatusLabel = (status: string) =>
    CHECK_STATUS_LABELS[status] ?? status;

  readonly strategyLabel = (strategy: string) =>
    pageSpeedStrategyLabel(strategy);

  readonly pageSpeedError = (code: string | undefined) =>
    pageSpeedErrorLabel(code);

  readonly engineName = (id: string) => engineLabel(id);

  readonly engineStatus = (status: string) => engineStatusLabel(status);

  readonly allFindings = computed<ReportFinding[]>(() =>
    this.pages()
      .filter(
        (page) => page.access !== 'blocked' && page.access !== 'unavailable',
      )
      .flatMap((page) =>
        page.findings.map((finding) => ({
          ...finding,
          viewport: page.viewport,
          pageUrl: page.url,
        })),
      ),
  );

  readonly urlOptions = computed(() => [
    ...new Set(this.allFindings().map((finding) => finding.pageUrl)),
  ]);

  readonly visibleFindings = computed(() =>
    filterFindings(this.allFindings(), this.filters()).filter(
      (finding) =>
        (!this.viewport() || finding.viewport === this.viewport()) &&
        (!this.urlFilter() || finding.pageUrl === this.urlFilter()),
    ),
  );

  readonly visibleChecks = computed(() =>
    this.checks().filter(
      (check) =>
        (!this.viewport() || check.viewport === this.viewport()) &&
        (!this.urlFilter() || check.url === this.urlFilter()) &&
        (!this.statusFilter() || check.status === this.statusFilter()) &&
        (!this.filters().rule || check.rule === this.filters().rule) &&
        (!this.filters().query ||
          `${check.rule} ${check.title} ${check.message} ${check.evidence ?? ''} ${check.measurement ?? ''}`
            .toLowerCase()
            .includes(this.filters().query.trim().toLowerCase())),
    ),
  );

  /** Öncelikli düzeltme önerileri; bulgu sayısı ve önem derecesine göre. */
  readonly recommendations = computed(() =>
    buildRecommendations(this.visibleFindings(), 10),
  );

  /** Ekran görüntüleri; yeni kayıtlar dosyadan, eski kayıtlar base64 olarak. */
  readonly artifacts = computed<ArtifactEntry[]>(() =>
    this.pages().flatMap((page) =>
      pageArtifacts(page).map((artifact) => ({
        ...artifact,
        url: artifact.url || `${this.baseUrl}/scans/artifacts/${artifact.id}`,
        viewport: page.viewport,
        pageUrl: page.url,
      })),
    ),
  );

  readonly hasArtifacts = computed(() => this.artifacts().length > 0);

  readonly isFiltered = computed(() => {
    const filters = this.filters();
    return Boolean(
      filters.severity ||
      filters.category ||
      filters.rule ||
      filters.query ||
      this.viewport() ||
      this.urlFilter() ||
      this.statusFilter(),
    );
  });

  sectionChecks(section: ReportSectionId): ScanCheck[] {
    return checksForSection(this.visibleChecks(), section);
  }

  sectionFindings(section: ReportSectionId): ReportFinding[] {
    return findingsForSection(
      this.visibleFindings(),
      section,
    ) as ReportFinding[];
  }

  sectionCount(section: ReportSectionId): number {
    return (
      this.sectionChecks(section).length + this.sectionFindings(section).length
    );
  }

  sectionVisible(section: ReportSectionId): boolean {
    return this.sectionCount(section) > 0;
  }

  limit(section: string): number {
    return this.visibleCounts()[section] ?? PAGE_LIMIT;
  }

  visibleItems<T>(section: string, items: T[]): T[] {
    return items.slice(0, this.limit(section));
  }

  hasMore(section: string, total: number): boolean {
    return total > this.limit(section);
  }

  showMore(section: string) {
    this.visibleCounts.update((counts) => ({
      ...counts,
      [section]: (counts[section] ?? PAGE_LIMIT) + PAGE_LIMIT,
    }));
  }

  expandAll() {
    for (const element of this.groupElements())
      element.nativeElement.open = true;
  }

  collapseAll() {
    for (const element of this.groupElements())
      element.nativeElement.open = false;
  }

  clearFilters() {
    this.filters.set(emptyFilters());
    this.viewport.set('');
    this.urlFilter.set('');
    this.statusFilter.set('');
  }

  setFilter<K extends keyof FindingFilters>(key: K, value: string) {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
  }

  severityLabel(value: string) {
    return SEVERITY_LABELS[value] ?? value;
  }

  categoryLabel(value: string) {
    return CATEGORY_LABELS[value] ?? value;
  }

  ruleLabel(value: string) {
    return RULE_LABELS[value] ?? value;
  }

  statusLabel(status: string) {
    return scanStatusLabel(status);
  }

  errorLabel(code: string | null) {
    return scanErrorLabel(code);
  }

  openArtifact(artifact: ArtifactEntry) {
    this.zoomed.set(artifact);
  }

  closeArtifact() {
    this.zoomed.set(null);
  }
}
