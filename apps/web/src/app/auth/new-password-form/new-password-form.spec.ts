import { TestBed } from '@angular/core/testing';
import { PASSWORD_TOO_SHORT } from '@bookit/shared';
import { NewPasswordForm, PASSWORDS_DIFFER } from './new-password-form';

describe('NewPasswordForm', () => {
  async function setup() {
    const fixture = TestBed.createComponent(NewPasswordForm);
    fixture.componentRef.setInput('submitLabel', 'Ustaw hasło');
    const emitted: string[] = [];
    fixture.componentInstance.submitted.subscribe((p) => emitted.push(p));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const [password, repeat] = Array.from(el.querySelectorAll('input'));
    const fill = async (a: string, b: string) => {
      for (const [input, value] of [
        [password, a],
        [repeat, b],
      ] as const) {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
      }
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { el, emitted, fill };
  }

  it('emits the password when both fields match and it is long enough', async () => {
    const { emitted, fill } = await setup();
    await fill('long-enough-pass', 'long-enough-pass');
    expect(emitted).toEqual(['long-enough-pass']);
  });

  it('says the password is too short', async () => {
    const { el, emitted, fill } = await setup();
    await fill('short', 'short');
    expect(emitted).toEqual([]);
    expect(el.textContent).toContain(PASSWORD_TOO_SHORT);
  });

  it('says the two passwords differ', async () => {
    const { el, emitted, fill } = await setup();
    await fill('long-enough-pass', 'long-enough-pasS');
    expect(emitted).toEqual([]);
    expect(el.textContent).toContain(PASSWORDS_DIFFER);
  });
});
