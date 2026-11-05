import { describe, expect, it } from 'vitest';
import {
  CONSOLE_LOCALE_PREFERENCE,
  displayName,
  isKnownLifecycleState,
  isPubliclyVisible,
  LIFECYCLE_LABELS,
  lifecycleLabel,
  lifecycleTone,
  PROPERTY_LIFECYCLE_STATES,
  SUPPORTED_LOCALE_LABELS,
} from './property';

/**
 * The name comes from `property_translation`, one row per locale, and
 * `GET /admin/properties` returns whichever of them exist. Every branch below is
 * a real state a property can be in mid-onboarding.
 */
describe('displayName', () => {
  it('prefers Vietnamese, because the console itself is Vietnamese', () => {
    expect(displayName({ vi: 'Khách sạn A', en: 'Hotel A' })).toBe('Khách sạn A');
    expect(CONSOLE_LOCALE_PREFERENCE[0]).toBe('vi');
  });

  it('falls back to English when only English has been written', () => {
    expect(displayName({ en: 'Hotel A' })).toBe('Hotel A');
  });

  it('returns null rather than a placeholder when no name exists', () => {
    // The caller decides how to show the gap. Substituting the slug here would
    // make an unnamed property indistinguishable from a named one everywhere.
    expect(displayName({})).toBeNull();
  });

  it('treats a blank name as no name', () => {
    expect(displayName({ vi: '   ', en: 'Hotel A' })).toBe('Hotel A');
    expect(displayName({ vi: '   ' })).toBeNull();
  });

  it('still shows a name in a locale outside the frozen two', () => {
    // Doc 25 freezes vi and en, and the CHECK constraint enforces it — but
    // showing nothing would be worse than showing what arrived.
    expect(displayName({ fr: 'Hôtel A' })).toBe('Hôtel A');
  });

  it('labels exactly the two frozen locales for the authoring surface', () => {
    expect(Object.keys(SUPPORTED_LOCALE_LABELS)).toEqual(['vi', 'en']);
  });
});

/**
 * The lifecycle is frozen in doc 52 §3.1 and mirrored from
 * `property.PropertyLifecycleState`. These tests exist so that a change to
 * either side is caught here rather than shown to an operator as a confidently
 * wrong status.
 */
describe('property lifecycle', () => {
  it('carries exactly the five frozen states, in the documented order', () => {
    expect(PROPERTY_LIFECYCLE_STATES).toEqual([
      'DRAFT',
      'COMING_SOON',
      'OPEN',
      'TEMPORARILY_CLOSED',
      'CLOSED',
    ]);
  });

  it('labels every state, and never collapses two into one', () => {
    const labels = PROPERTY_LIFECYCLE_STATES.map((state) => LIFECYCLE_LABELS[state]);
    expect(labels).toHaveLength(5);
    // Distinctness is the point: DRAFT, TEMPORARILY_CLOSED and CLOSED all mean
    // "guests cannot book", and a shared label would erase the difference.
    expect(new Set(labels).size).toBe(5);
  });

  it('translates rather than reinterprets', () => {
    // §4 of the brief: DRAFT must not become "Inactive", "Pending" or
    // "Unpublished". Those describe a workflow the lifecycle does not have.
    expect(LIFECYCLE_LABELS.DRAFT).toBe('Bản nháp');
    expect(LIFECYCLE_LABELS.DRAFT).not.toMatch(/duyệt|chờ|kích hoạt/i);
  });

  it('falls back to the backend value for a state it does not know', () => {
    // A sixth state added to the enum must surface as itself, not crash and not
    // be silently mapped onto a familiar one.
    expect(lifecycleLabel('UNDER_RENOVATION')).toBe('UNDER_RENOVATION');
    expect(lifecycleTone('UNDER_RENOVATION')).toBe('neutral');
    expect(isKnownLifecycleState('UNDER_RENOVATION')).toBe(false);
  });

  it('gives each state its own tone without relying on tone for meaning', () => {
    expect(lifecycleTone('OPEN')).toBe('success');
    expect(lifecycleTone('DRAFT')).toBe('neutral');
    expect(lifecycleTone('TEMPORARILY_CLOSED')).toBe('warning');
    expect(lifecycleTone('CLOSED')).toBe('danger');
  });

  it('mirrors isPubliclyVisible() exactly, state by state', () => {
    // Doc 52 §3.1 / doc 58 §3.1: public when OPEN, COMING_SOON or
    // TEMPORARILY_CLOSED. Pinned per state so a drift from the backend enum
    // fails here instead of telling a partner their draft is live.
    expect(isPubliclyVisible('OPEN')).toBe(true);
    expect(isPubliclyVisible('COMING_SOON')).toBe(true);
    expect(isPubliclyVisible('TEMPORARILY_CLOSED')).toBe(true);
    expect(isPubliclyVisible('DRAFT')).toBe(false);
    expect(isPubliclyVisible('CLOSED')).toBe(false);
  });
});
