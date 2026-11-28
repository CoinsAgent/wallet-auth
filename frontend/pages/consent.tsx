import { useCallback } from 'react';
import { DeviceApproval, Consent, ManagementApproval, ManagementAuthorizations } from '../authorization';
import { SignIn } from './sign-in';
import type { Session } from '../wallet-auth';
function AuthorizationSignIn({ ready }: { ready: () => void }) {
  const onSession = useCallback((session: Session | null) => { if (session) ready(); }, [ready]);
  return <SignIn onSession={onSession} />;
}
export function ConsentPage({ id }: { id: string }) {
  return <Consent id={id} signIn={ready => <AuthorizationSignIn ready={ready} />} />;
}

export function ManagementPage({ id }: { id?: string }) {
  const signIn = (ready: () => void) => <AuthorizationSignIn ready={ready} />;
  return id ? <ManagementApproval id={id} signIn={signIn} /> : <ManagementAuthorizations signIn={signIn} />;
}

export function DevicePage({code}:{code?:string}){return <DeviceApproval code={code} signIn={ready=><AuthorizationSignIn ready={ready}/>}/>;}
