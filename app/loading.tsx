import { Screen } from '@/components/ui/Screen';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

export default function LoadingScreen() {
  return (
    <Screen>
      <LoadingSkeleton label="Opening your kitchen…" />
    </Screen>
  );
}
