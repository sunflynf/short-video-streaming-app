import { Redirect } from 'expo-router';
import { useAuth } from '../store/auth';

/** `/` is open to everyone and sends you to the right place for your session. */
export default function Index() {
  const signedIn = useAuth((s) => !!s.session);
  return <Redirect href={signedIn ? '/home' : '/welcome'} />;
}
