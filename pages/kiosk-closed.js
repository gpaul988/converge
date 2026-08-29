export default function KioskClosed() {
  return (
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', fontFamily: 'sans-serif'}}>
      <h1 style={{fontSize: 28, marginBottom: 12}}>Thank you — Check-in complete</h1>
      <p style={{opacity: 0.8}}>This device is now closed. Please return to the host for further assistance.</p>
      <p style={{marginTop: 20, color: '#888', fontSize: 12}}>If you are the event operator you can reopen the kiosk from the admin UI.</p>
    </div>
  );
}
