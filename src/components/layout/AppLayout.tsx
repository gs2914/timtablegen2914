import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, Database, Play, Eye, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/input', icon: Database, label: 'Input' },
  { to: '/generate', icon: Play, label: 'Generate' },
  { to: '/view', icon: Eye, label: 'View' },
  { to: '/export', icon: Download, label: 'Export' },
];

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">TT</span>
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight text-foreground">Smart CSE Timetable</h1>
          <p className="text-xs text-muted-foreground">Generator</p>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t flex justify-around py-1.5 z-50">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs transition-colors',
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
