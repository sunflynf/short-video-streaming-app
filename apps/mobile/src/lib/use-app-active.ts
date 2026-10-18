import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** False while the app is in the background, so videos can pause. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}
