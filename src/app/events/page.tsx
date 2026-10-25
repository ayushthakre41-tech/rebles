'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  capacity: number;
  status: string;
  created_at: string;
}

export default function EventsListPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/events')
      .then((r) => r.json())
      .then((d) => { setEvents(d.events || []); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="animate-in">
        <div className="page-header">
          <h1 className="page-title">All Events</h1>
        </div>
        <div className="loading-bar" />
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">All Events</h1>
          <p className="page-subtitle">{events.length} event{events.length !== 1 ? 's' : ''} in the system</p>
        </div>
        <Link href="/events/new" className="btn btn-primary">
          ➕ New Event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <div className="empty-state-title">No events yet</div>
          <div className="empty-state-desc">
            <Link href="/events/new">Create your first event</Link> or{' '}
            <Link href="/test-runs">run the test cases</Link> to populate the system.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Venue</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{ev.title}</td>
                    <td>{ev.date} {ev.time}</td>
                    <td>{ev.venue}</td>
                    <td>{ev.capacity}</td>
                    <td>
                      <span className={`badge badge-${ev.status.toLowerCase()}`}>{ev.status}</span>
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                    <td>
                      <Link href={`/events/${ev.id}`} className="btn btn-sm btn-secondary">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
