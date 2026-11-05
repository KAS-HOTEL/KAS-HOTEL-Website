import { EmptyState } from '@/ui/primitives';

export default function NotFound() {
  return (
    <main style={{ padding: 'var(--space-8)' }}>
      <EmptyState title="Page not found">
        The page you asked for does not exist.
      </EmptyState>
    </main>
  );
}
