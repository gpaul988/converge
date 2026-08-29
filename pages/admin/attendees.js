import React, { useEffect, useState } from 'react';

export default function AdminAttendees() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [filter, setFilter] = useState('all');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchState();
  }, []);

  async function fetchState() {
    setLoading(true);
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      setState(data);
    } catch (e) {
      setMessage('Failed to load state');
    } finally {
      setLoading(false);
    }
  }

  function filteredAttendees() {
    if (!state || !Array.isArray(state.attendees)) return [];
    return state.attendees.filter(a => filter === 'all' ? true : (a.type === filter));
  }

  function toggleChecked(i) {
    const next = { ...(state || {}) };
    next.attendees = (next.attendees || []).map(a => ({ ...a }));
    next.attendees[i].checkedIn = !next.attendees[i].checkedIn;
    setState(next);
  }

  function reopenDevice(id) {
    if (!state) return;
    const next = { ...state };
    next.closedDevices = (next.closedDevices || []).filter(d => d !== id);
    setState(next);
  }

  async function saveState() {
    if (!state) return;
    setLoading(true);
    setMessage('Saving...');
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (adminPass) headers['x-admin-password'] = adminPass;
      const res = await fetch('/api/state', { method: 'POST', headers, body: JSON.stringify(state) });
      if (res.ok) {
        setMessage('Saved');
        fetchState();
      } else if (res.status === 401) {
        setMessage('Unauthorized: bad admin password');
      } else {
        const body = await res.json().catch(() => ({}));
        setMessage('Save failed: ' + (body.error || res.statusText));
      }
    } catch (e) {
      setMessage('Save error');
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 3000);
    }
  }

  function exportCsv() {
    if (!state || !Array.isArray(state.attendees)) return;
    const rows = state.attendees.map(a => [a.name || '', a.type || '', a.phone || '', a.code || '', a.checkedIn ? 'true' : '']);
    const header = ['Name','Type','Phone','Code','CheckedIn'];
    const csv = [header, ...rows].map(r => r.map(c => '"' + String(c||'').replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'attendees.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !state) return <div style={{padding:20}}>Loading...</div>;

  return (
    <div style={{padding:20,fontFamily:'sans-serif'}}>
      <h2>Admin — Attendees</h2>
      <p style={{color:'#666'}}>Manage uploaded attendees and kiosk devices. Save requires the ADMIN_PASSWORD (if configured).</p>

      <div style={{marginBottom:12}}>
        <label style={{marginRight:8}}>Admin password:</label>
        <input type="password" value={adminPass} onChange={(e)=>setAdminPass(e.target.value)} style={{marginRight:8}} />
        <button onClick={saveState} disabled={loading}>Save changes</button>
        <button onClick={fetchState} style={{marginLeft:8}}>Reload</button>
        <button onClick={exportCsv} style={{marginLeft:8}}>Export CSV</button>
        <span style={{marginLeft:12,color:'#007b00'}}>{message}</span>
      </div>

      <div style={{marginBottom:12}}>
        <label>Filter type:</label>
        <select value={filter} onChange={(e)=>setFilter(e.target.value)} style={{marginLeft:8}}>
          <option value="all">All</option>
          <option value="attendee">Attendee</option>
          <option value="jobseeker">Jobseeker</option>
        </select>
      </div>

      <div style={{display:'flex',gap:20}}>
        <div style={{flex:1}}>
          <h3>Attendees ({(state && state.attendees? state.attendees.length:0)})</h3>
          <div style={{maxHeight:400,overflow:'auto',border:'1px solid #eee'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <th style={{textAlign:'left',padding:8}}>Name</th>
                  <th style={{textAlign:'left',padding:8}}>Type</th>
                  <th style={{textAlign:'left',padding:8}}>Phone</th>
                  <th style={{textAlign:'left',padding:8}}>Code</th>
                  <th style={{textAlign:'left',padding:8}}>CheckedIn</th>
                  <th style={{textAlign:'left',padding:8}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(filteredAttendees()).map((a, idx) => {
                  const fullIdx = (state.attendees || []).indexOf(a);
                  return (
                    <tr key={a.id || idx} style={{background: a.checkedIn ? '#e6f8e6':'transparent'}}>
                      <td style={{padding:8}}>
                        <input value={a.name || ''} onChange={(e)=>{
                          const next = {...state}; next.attendees = (next.attendees||[]).map(x=>({...x})); next.attendees[fullIdx].name = e.target.value; setState(next);
                        }} />
                      </td>
                      <td style={{padding:8}}>
                        <select value={a.type || 'attendee'} onChange={(e)=>{
                          const next = {...state}; next.attendees = (next.attendees||[]).map(x=>({...x})); next.attendees[fullIdx].type = e.target.value; setState(next);
                        }}>
                          <option value="attendee">Attendee</option>
                          <option value="jobseeker">Jobseeker</option>
                        </select>
                      </td>
                      <td style={{padding:8}}>
                        <input value={a.phone || ''} onChange={(e)=>{ const next = {...state}; next.attendees = (next.attendees||[]).map(x=>({...x})); next.attendees[fullIdx].phone = e.target.value; setState(next); }} />
                      </td>
                      <td style={{padding:8}}>
                        <input value={a.code || ''} onChange={(e)=>{ const next = {...state}; next.attendees = (next.attendees||[]).map(x=>({...x})); next.attendees[fullIdx].code = e.target.value; setState(next); }} />
                      </td>
                      <td style={{padding:8}}>{a.checkedIn? (a.time || 'Yes') : 'No'}</td>
                      <td style={{padding:8}}>
                        <button onClick={()=>toggleChecked(fullIdx)}>{a.checkedIn? 'Unmark':'Mark'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{width:340}}>
          <h3>Closed Devices ({(state && state.closedDevices? state.closedDevices.length:0)})</h3>
          <div style={{maxHeight:400,overflow:'auto',border:'1px solid #eee',padding:8}}>
            {(state && state.closedDevices && state.closedDevices.length>0) ? state.closedDevices.map((d) => (
              <div key={d} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #fafafa'}}>
                <div style={{fontSize:12,wordBreak:'break-all'}}>{d}</div>
                <div>
                  <button onClick={()=>{ reopenDevice(d); }}>Reopen</button>
                </div>
              </div>
            )) : <p style={{opacity:0.7}}>No closed devices</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
