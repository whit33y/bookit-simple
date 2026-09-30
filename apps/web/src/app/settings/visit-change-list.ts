import { Component, computed, input } from '@angular/core';
import {
  describeVisitChange,
  formatWarsawDateTime,
  VisitChangeView,
} from '@bookit/shared';

/**
 * Historia zmian entries, newest first: who, when, and what changed. Shared by the
 * settings screen and the Historia tab of the Wizyta card (#30).
 */
@Component({
  selector: 'app-visit-change-list',
  template: `
    <ul class="list" aria-label="Historia zmian">
      @for (item of items(); track item.id) {
        <li class="change">
          <span class="meta"
            ><span class="author">{{ item.author }}</span> ·
            <time [attr.datetime]="item.at">{{ item.when }}</time></span
          >
          <span class="summary">{{ item.summary }}</span>
          @for (line of item.details; track $index) {
            <span class="detail">{{ line }}</span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      overflow: hidden;
    }
    .change {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px;
      background: var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      overflow-wrap: anywhere;
    }
    .change:last-child {
      border-bottom: 0;
    }
    .meta {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .author {
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }
    .summary {
      font-weight: 600;
    }
    .detail {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class VisitChangeList {
  readonly changes = input.required<VisitChangeView[]>();

  protected readonly items = computed(() =>
    this.changes().map((change) => ({
      id: change.id,
      at: change.at,
      author: change.staffMemberName,
      when: formatWarsawDateTime(change.at),
      ...describeVisitChange(change),
    })),
  );
}
