import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MeResponse } from '@bookit/shared';
import { AuthService } from '../../auth/auth.service';
import { OWNER } from '../../auth/me.fixtures';
import { PanelLayout } from './panel-layout';

describe('PanelLayout', () => {
  async function menuFor(me: MeResponse) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient()],
    });
    const auth = TestBed.inject(AuthService);
    vi.spyOn(auth, 'me').mockReturnValue(me);
    const fixture = TestBed.createComponent(PanelLayout);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const labels = (selector: string) =>
      Array.from(el.querySelectorAll(`${selector} a`)).map((a) => {
        const label = a.cloneNode(true) as HTMLElement;
        label.querySelectorAll('mat-icon').forEach((icon) => icon.remove());
        return label.textContent?.trim();
      });
    return {
      el,
      side: labels('nav[aria-label="Menu boczne"]'),
      bottom: labels('nav[aria-label="Nawigacja dolna"]'),
    };
  }

  it('shows the Właściciel the settings, in both menus', async () => {
    const { side, bottom, el } = await menuFor(OWNER);
    expect(side).toEqual(['Kalendarz', 'Klienci', 'Ustawienia']);
    expect(bottom).toEqual(side);
    expect(el.textContent).toContain('Studio Kora');
  });

  it('hides the settings from a Pracownik', async () => {
    const { side } = await menuFor({ ...OWNER, role: 'EMPLOYEE' });
    expect(side).toEqual(['Kalendarz', 'Klienci']);
  });
});
