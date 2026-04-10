export const CsrfHiddenInput = (props: { token: string }) => {
  return <input type="hidden" name="csrf_token" value={props.token || ''} />
}
