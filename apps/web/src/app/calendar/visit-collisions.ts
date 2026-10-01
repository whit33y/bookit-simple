import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  ABSENCE_DEFAULT_LABEL,
  formatWarsawDateTime,
  VISIT_COLLISION,
  VisitCollision,
  warsawDate,
  warsawTime,
} from '@bookit/shared';

/** The Kolizje of a save that answered `409`, for the Wizyta form and card. */
@Component({
  selector: 'app-visit-collisions',
  imports: [MatIconModule],
  template: `
    <div class="collisions" role="alert">
      <p>
        <mat-icon aria-hidden="true">warning</mat-icon>
        {{ message }}:
      </p>
      <ul aria-label="Kolizje">
        @for (item of items(); track item.id) {
          <li>
            <mat-icon aria-hidden="true">{{ item.icon }}</mat-icon>
            <span
              ><strong>{{ item.when }}</strong> {{ item.label }}</span
            >
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    .collisions {
      margin: 0 0 8px;
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    p,
    li {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 0;
    }
    p {
      margin-bottom: 4px;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      min-height: 32px;
      overflow-wrap: anywhere;
    }
  `,
})
export class VisitCollisions {
  readonly collisions = input.required<VisitCollision[]>();

  protected readonly message = VISIT_COLLISION;

  protected readonly items = computed(() =>
    this.collisions().map((c) => ({
      id: `${c.type}-${c.id}`,
      icon: c.type === 'visit' ? 'event' : 'block',
      label: c.label || ABSENCE_DEFAULT_LABEL,
      when:
        warsawDate(new Date(c.startsAt)) === warsawDate(new Date(c.endsAt))
          ? `${formatWarsawDateTime(c.startsAt)}–${warsawTime(c.endsAt)}`
          : `${formatWarsawDateTime(c.startsAt)} – ${formatWarsawDateTime(c.endsAt)}`,
    })),
  );
}
