import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

// Material sayfalayıcısı varsayılan olarak İngilizce etiketler kullanır.
@Injectable()
export class TurkishPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Sayfa başına kayıt';
  override nextPageLabel = 'Sonraki sayfa';
  override previousPageLabel = 'Önceki sayfa';
  override firstPageLabel = 'İlk sayfa';
  override lastPageLabel = 'Son sayfa';

  override getRangeLabel = (page: number, pageSize: number, length: number) => {
    if (length === 0 || pageSize === 0) return '0 kayıttan 0 arasında';
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, length);
    return `${start} - ${end} / ${length} kayıt`;
  };
}
