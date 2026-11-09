import { describe, expect, it, vi } from 'vitest';

const setOrder = vi.fn(async () => ({}));
vi.mock('@/lib/api/endpoints', () => ({ mediaApi: { setOrder: (...args: unknown[]) => setOrder(...(args as [])) } }));

const { moveBlock, persistOrder } = await import('./useGalleryArrange');

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('moving photos', () => {
  it('moves one photo before or after another', () => {
    expect(moveBlock(ids, ['e'], 'b', false)).toEqual(['a', 'e', 'b', 'c', 'd']);
    expect(moveBlock(ids, ['a'], 'c', true)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('moves a selection as one block, keeping its own order', () => {
    expect(moveBlock(ids, ['d', 'b'], 'a', false)).toEqual(['b', 'd', 'a', 'c', 'e']);
    expect(moveBlock(ids, ['a', 'c'], 'e', true)).toEqual(['b', 'd', 'e', 'a', 'c']);
  });

  it('changes nothing when dropped on itself or on an unknown photo', () => {
    expect(moveBlock(ids, ['b', 'c'], 'c', true)).toEqual(ids);
    expect(moveBlock(ids, ['b'], 'zz', true)).toEqual(ids);
  });

  it('writes only the positions that changed', async () => {
    const item = (id: string) => ({ asset: { id: `asset-${id}` }, link: { id } }) as never;
    setOrder.mockClear();
    await persistOrder(['a', 'b', 'c'].map(item), ['a', 'c', 'b']);
    expect(setOrder.mock.calls).toEqual([['asset-c', 'c', 1], ['asset-b', 'b', 2]]);
  });
});
