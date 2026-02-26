import React, { forwardRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, Database, Play, Eye, Users, Download, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/input', icon: Database, label: 'Input' },
  { to: '/generate', icon: Play, label: 'Generate' },
  { to: '/view', icon: Eye, label: 'Section' },
  { to: '/faculty-view', icon: Users, label: 'Faculty' },
  { to: '/export', icon: Download, label: 'Export' },
];

const AppLayout = forwardRef<HTMLDivElement>((_, ref) => {
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    toast({ title: 'Logged out' });
  };

  return (
    <div ref={ref} className="flex flex-col min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">TT</span>
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold leading-tight text-foreground">Smart CSE Timetable</h1>
          <p className="text-xs text-muted-foreground">Generator</p>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="h-7 text-xs">
              <LogOut className="h-3 w-3 mr-1" /> Logout
            </Button>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t flex justify-around py-1.5 z-50 overflow-x-auto">
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
});
AppLayout.displayName = 'AppLayout';

export default AppLayout;
