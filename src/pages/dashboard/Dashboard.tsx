import { useAuth } from '@/contexts/AuthContext';
import StudentDashboard from './student/StudentDashboard';
import CompanyDashboard from './company/CompanyDashboard';
import AdminDashboard from './admin/AdminDashboard';

export default function Dashboard() {
  const { profile } = useAuth();

  if (profile?.role === 'admin') return <AdminDashboard />;
  if (profile?.role === 'company') return <CompanyDashboard />;
  return <StudentDashboard />;
}
