import { useLocation } from 'wouter';

let inAppSteps = 0;
/** Called by the store shell on each in-app route change. */
export const recordNavigation = () => { inAppSteps += 1; };

/** Go to the previous in-app screen when there is one, otherwise a sensible fallback. */
export function useBack(fallback: string) {
  const [, navigate] = useLocation();
  return () => {
    if (inAppSteps > 1) { inAppSteps -= 2; window.history.back(); }
    else navigate(fallback);
  };
}
