import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LAST_OWNER, StaffMemberView } from '@bookit/shared';
import { EditStaffDialog } from './edit-staff-dialog';

const ANNA: StaffMemberView = {
  id: 's1',
  displayName: 'Anna',
  email: 'anna@studiokora.pl',
  role: 'OWNER',
  invitation: 'ACCEPTED',
  acceptsVisits: true,
  showOnPage: true,
  photoId: null,
  bio: null,
};

describe('EditStaffDialog', () => {
  async function setup() {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: ANNA },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EditStaffDialog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((r) => setTimeout(r));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const { form } = fixture.componentInstance as unknown as {
      form: FormGroup;
    };
    const submit = async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { http, close, el, form, settle, submit };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('saves the changes and closes with the saved person', async () => {
    const { http, close, form, submit, settle } = await setup();

    form.patchValue({ displayName: ' Anna K. ', acceptsVisits: false, bio: '  ' });
    await submit();

    const req = http.expectOne({ url: '/api/staff/s1', method: 'PATCH' });
    expect(req.request.body).toEqual({
      displayName: 'Anna K.',
      role: 'OWNER',
      acceptsVisits: false,
      showOnPage: true,
      bio: null,
    });
    const saved = { ...ANNA, displayName: 'Anna K.', acceptsVisits: false };
    req.flush(saved);
    await settle();

    expect(close).toHaveBeenCalledWith(saved);
  });

  it('stays open with the message when the last Właściciel would lose the role', async () => {
    const { http, close, el, form, submit, settle } = await setup();

    form.patchValue({ role: 'EMPLOYEE' });
    await submit();
    http
      .expectOne('/api/staff/s1')
      .flush(
        { message: LAST_OWNER, error: 'Unprocessable Entity' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await settle();

    expect(close).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      LAST_OWNER,
    );
  });

  it('does not save without a name', async () => {
    const { http, form, submit } = await setup();

    form.patchValue({ displayName: '' });
    await submit();

    http.expectNone('/api/staff/s1');
  });
});
