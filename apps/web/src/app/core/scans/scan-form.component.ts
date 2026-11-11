import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { parseScanUrls } from './scan.report';

@Component({
  selector: 'app-scan-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './scan-form.component.html',
  styleUrl: './scan-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly busy = input(false);
  readonly locked = input(false);
  readonly started = output<string[]>();
  readonly removed = output<string>();

  readonly form = this.fb.nonNullable.group({
    urls: ['', [Validators.required]],
  });
  readonly error = signal<string | null>(null);
  readonly parsed = signal<string[]>([]);
  readonly canSubmit = computed(
    () => !this.busy() && !this.locked() && this.parsed().length > 0,
  );

  constructor() {
    this.form.controls.urls.valueChanges.subscribe((value) => {
      const result = parseScanUrls(value ?? '');
      this.parsed.set(result.error ? [] : result.urls);
      this.error.set(result.error);
    });
  }

  remove(index: number) {
    const urls = [...this.parsed()];
    urls.splice(index, 1);
    const value = urls.join('\n');
    this.form.controls.urls.setValue(value);
    this.removed.emit(value);
  }

  submit() {
    if (this.busy() || this.locked()) return;
    const result = parseScanUrls(this.form.controls.urls.value);
    if (result.error) {
      this.error.set(result.error);
      return;
    }
    this.error.set(null);
    this.started.emit(result.urls);
  }
}
