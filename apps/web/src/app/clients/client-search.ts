import { Component, effect, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ClientView, formatPhone, phoneSearchDigits } from '@bookit/shared';
import { filter, startWith, tap } from 'rxjs';
import { ClientDialogData, openClientDialog } from './client-dialog';
import { ClientsService } from './clients.service';

/**
 * The option after the Klienci found. Not a string: the autocomplete writes the value of
 * the picked option into the field, and a string would count as typed text.
 */
const ADD_NEW = { addNew: true } as const;

type Value = string | ClientView | typeof ADD_NEW;

/** A query the search takes for a phone starts the phone; anything else, the name. */
const newClientFrom = (query: string): ClientDialogData =>
  phoneSearchDigits(query) !== null
    ? { phone: query }
    : query
      ? { name: query }
      : {};

/**
 * Picks a Klient by name or phone, or adds a new one from what was typed, e.g. in the
 * form of a Wizyta (#30). Bind `[(client)]`; it is `null` until a Klient is picked and
 * again once the text is changed.
 */
@Component({
  selector: 'app-client-search',
  imports: [
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  template: `
    <mat-form-field appearance="outline">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [formControl]="control"
        [matAutocomplete]="auto"
        autocomplete="off"
      />
      <mat-hint>Imię lub telefon</mat-hint>
      <mat-autocomplete
        #auto="matAutocomplete"
        [displayWith]="display"
        (optionSelected)="selected($event)"
      >
        @for (item of results(); track item.id) {
          <mat-option [value]="item">
            <span class="name">{{ item.name }}</span>
            @if (item.phoneE164) {
              <span class="phone">{{ formatPhone(item.phoneE164) }}</span>
            }
          </mat-option>
        }
        @if (error(); as message) {
          <mat-option disabled>{{ message }}</mat-option>
        }
        <mat-option [value]="addNew">
          <mat-icon>person_add</mat-icon>
          Dodaj nowego Klienta
          @if (query()) {
            „{{ query() }}”
          }
        </mat-option>
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `
    mat-form-field {
      width: 100%;
    }
    .phone {
      margin-left: 8px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ClientSearch {
  private readonly api = inject(ClientsService);
  private readonly dialog = inject(MatDialog);

  readonly client = model<ClientView | null>(null);
  readonly label = input('Klient');

  protected readonly addNew = ADD_NEW;
  protected readonly formatPhone = formatPhone;
  protected readonly control = new FormControl<Value>('', {
    nonNullable: true,
  });
  protected readonly results = signal<ClientView[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly query = signal('');

  protected readonly display = (value: Value | null): string =>
    typeof value === 'string'
      ? value
      : value && 'id' in value
        ? value.name
        : '';

  constructor() {
    // A Klient set from outside shows in the field.
    effect(() => {
      const client = this.client();
      if (client && this.control.value !== client) {
        this.control.setValue(client, { emitEvent: false });
      }
    });

    const typed = this.control.valueChanges.pipe(
      filter((value): value is string => typeof value === 'string'),
      tap((q) => {
        this.query.set(q.trim());
        if (this.client()) this.client.set(null);
      }),
    );
    this.api
      .searchWhileTyping(typed.pipe(startWith('')))
      .pipe(takeUntilDestroyed())
      .subscribe((result) => {
        this.results.set(result.clients ?? []);
        this.error.set(result.error ?? null);
      });
  }

  protected async selected(event: MatAutocompleteSelectedEvent): Promise<void> {
    const value = event.option.value as ClientView | typeof ADD_NEW;
    if ('id' in value) {
      this.client.set(value);
      return;
    }
    // Put the typed text back while the dialog is open.
    this.control.setValue(this.query(), { emitEvent: false });
    const saved = await openClientDialog(this.dialog, {
      ...newClientFrom(this.query()),
      canPickExisting: true,
    });
    if (!saved) return;
    this.control.setValue(saved, { emitEvent: false });
    this.client.set(saved);
  }
}
