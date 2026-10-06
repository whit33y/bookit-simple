import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AnnouncementGroup,
  announcementGroup,
  AnnouncementView,
  CalendarDay,
  photoUrl,
} from '@bookit/shared';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../../shared/error-message';
import {
  AnnouncementDialog,
  AnnouncementDialogData,
} from '../announcement-dialog/announcement-dialog';
import { AnnouncementsService } from '../announcements.service';
import {
  DeleteAnnouncementDialog,
  DeleteAnnouncementDialogData,
} from '../delete-announcement-dialog/delete-announcement-dialog';

interface Group {
  key: AnnouncementGroup;
  heading: string;
  empty: string;
  /** Order inside the group. */
  compare: (a: AnnouncementView, b: AnnouncementView) => number;
}

const byDay = (a: CalendarDay | null, b: CalendarDay | null) =>
  (a ?? '').localeCompare(b ?? '');

const GROUPS: Group[] = [
  {
    key: 'ACTIVE',
    heading: 'Aktywne',
    empty: 'Teraz Wizytówka nie pokazuje żadnego Ogłoszenia.',
    // Like the Wizytówka: newest first.
    compare: (a, b) => byDay(b.showFrom, a.showFrom),
  },
  {
    key: 'SCHEDULED',
    heading: 'Zaplanowane',
    empty: 'Brak zaplanowanych Ogłoszeń.',
    // The next one to show first.
    compare: (a, b) => byDay(a.showFrom, b.showFrom),
  },
  {
    key: 'PAST',
    heading: 'Minione',
    empty: 'Brak minionych Ogłoszeń.',
    // The one that ended last first.
    compare: (a, b) => byDay(b.showUntil, a.showUntil),
  },
];

/** `2026-10-01` → `1.10.2026`. */
function formatDay(day: CalendarDay): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${date}.${String(month).padStart(2, '0')}.${year}`;
}

function formatDays({ showFrom, showUntil }: AnnouncementView): string {
  if (showUntil === null) return `od ${formatDay(showFrom)}, bez końca`;
  if (showUntil === showFrom) return `tylko ${formatDay(showFrom)}`;
  return `${formatDay(showFrom)} – ${formatDay(showUntil)}`;
}

/**
 * `/panel/ustawienia/ogloszenia`: the Właściciel adds, edits and deletes Ogłoszenia.
 * They are grouped by what the Wizytówka shows today, counted in Europe/Warsaw.
 */
@Component({
  selector: 'app-announcements-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="top">
      <h1>Ogłoszenia</h1>
      <button mat-flat-button (click)="add()">
        <mat-icon>add</mat-icon>
        Dodaj Ogłoszenie
      </button>
    </div>
    <p class="intro">
      Wizytówka pokazuje Ogłoszenie tylko między dniem „od” i „do”, potem znika
      samo.
    </p>

    @if (actionError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (groups(); as groups) {
      @for (group of groups; track group.key) {
        <section [attr.aria-labelledby]="'group-' + group.key">
          <h2 [id]="'group-' + group.key">
            {{ group.heading }}
            <span class="count">{{ group.items.length }}</span>
          </h2>
          @if (group.items.length) {
            <ul class="list" [attr.aria-label]="group.heading">
              @for (item of group.items; track item.id) {
                <li class="row" [attr.aria-label]="item.title">
                  <div class="thumb">
                    @if (item.photoId) {
                      <img [src]="photoUrl(item.photoId)" alt="" />
                    } @else {
                      <mat-icon aria-hidden="true">campaign</mat-icon>
                    }
                  </div>
                  <div class="text">
                    <span class="title">{{ item.title }}</span>
                    <span class="days">{{ formatDays(item) }}</span>
                    <span class="body">{{ item.body }}</span>
                  </div>
                  <div class="actions">
                    <button
                      mat-icon-button
                      (click)="edit(item)"
                      [attr.aria-label]="'Edytuj: ' + item.title"
                      matTooltip="Edytuj"
                    >
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      [disabled]="busy()"
                      (click)="remove(item)"
                      [attr.aria-label]="'Usuń: ' + item.title"
                      matTooltip="Usuń"
                    >
                      <mat-icon>delete</mat-icon>
                    </button>
                  </div>
                </li>
              }
            </ul>
          } @else {
            <p class="empty">{{ group.empty }}</p>
          }
        </section>
      }
    } @else if (loadError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else {
      <mat-spinner diameter="32" aria-label="Wczytywanie" />
    }
  `,
  styles: `
    .top {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
      justify-content: space-between;
    }
    h1 {
      margin: 0;
    }
    .intro {
      margin: 8px 0 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    section {
      margin-bottom: 24px;
    }
    h2 {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 0 0 8px;
      font-size: 16px;
    }
    .count {
      padding: 0 8px;
      border-radius: 999px;
      font-size: 12px;
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      overflow: hidden;
    }
    .row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 12px 8px 12px 12px;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .row:last-child {
      border-bottom: 0;
    }
    .thumb {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 8px;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface-variant);
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .title {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .days {
      font-size: 12px;
      color: var(--mat-sys-primary);
    }
    .body {
      color: var(--mat-sys-on-surface-variant);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .actions {
      flex: none;
      display: flex;
    }
    .empty {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class AnnouncementsPage implements OnInit {
  private readonly api = inject(AnnouncementsService);
  private readonly dialog = inject(MatDialog);

  protected readonly photoUrl = photoUrl;
  protected readonly formatDays = formatDays;

  protected readonly announcements = signal<AnnouncementView[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** Grouped when the list changes; a page left open over midnight regroups on reload. */
  protected readonly groups = computed(() => {
    const announcements = this.announcements();
    if (!announcements) return null;
    const now = new Date();
    return GROUPS.map((group) => ({
      ...group,
      items: announcements
        .filter((a) => announcementGroup(a, now) === group.key)
        .sort(group.compare),
    }));
  });

  async ngOnInit(): Promise<void> {
    try {
      this.announcements.set(await this.api.list());
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  protected async add(): Promise<void> {
    const saved = await this.openDialog({});
    if (saved) this.announcements.update((list) => [saved, ...(list ?? [])]);
  }

  protected async edit(announcement: AnnouncementView): Promise<void> {
    const saved = await this.openDialog({ announcement });
    if (!saved) return;
    this.announcements.update(
      (list) => list?.map((a) => (a.id === saved.id ? saved : a)) ?? null,
    );
  }

  protected async remove(announcement: AnnouncementView): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<DeleteAnnouncementDialog, DeleteAnnouncementDialogData, boolean>(
          DeleteAnnouncementDialog,
          { data: { title: announcement.title } },
        )
        .afterClosed(),
    );
    if (!confirmed) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.api.remove(announcement.id);
      this.announcements.update(
        (list) => list?.filter((a) => a.id !== announcement.id) ?? null,
      );
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private openDialog(
    data: AnnouncementDialogData,
  ): Promise<AnnouncementView | undefined> {
    return firstValueFrom(
      this.dialog
        .open<AnnouncementDialog, AnnouncementDialogData, AnnouncementView>(
          AnnouncementDialog,
          { data, autoFocus: 'dialog' },
        )
        .afterClosed(),
    );
  }
}
