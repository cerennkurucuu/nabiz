// Uygulama içi görünümler. Yeni router bağımlılığı eklemeden, mevcut tek
// sayfa mimarisi sürdürülür; gezinme durumu sinyal ile tutulur.
export type ScanView = 'panel' | 'new-scan' | 'history' | 'compare' | 'report';

export interface NavItem {
  id: ScanView;
  label: string;
  hint: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'panel', label: 'Panel', hint: 'Genel bakış' },
  { id: 'new-scan', label: 'Yeni Tarama', hint: 'Adres gir ve tara' },
  { id: 'history', label: 'Geçmiş', hint: 'Önceki taramalar' },
  { id: 'compare', label: 'Karşılaştırma', hint: 'İki taramayı kıyasla' },
];

export const VIEW_TITLE: Record<ScanView, { title: string; subtitle: string }> =
  {
    panel: {
      title: 'Panel',
      subtitle:
        'Hesabınıza ait taramaların özeti. Tüm veriler yalnızca size gösterilir.',
    },
    'new-scan': {
      title: 'Yeni Tarama',
      subtitle: 'Her adres masaüstü ve mobil görünümde ayrı ayrı incelenir.',
    },
    history: {
      title: 'Tarama Geçmişi',
      subtitle: 'Daha önce çalıştırdığınız taramalar hesabınıza özeldir.',
    },
    compare: {
      title: 'Karşılaştırma',
      subtitle: 'Aynı adresi içeren iki tamamlanmış taramayı karşılaştırın.',
    },
    report: {
      title: 'Tarama Raporu',
      subtitle: 'Bulgular, kanıtlar ve görünüm bazlı erişim durumu.',
    },
  };
