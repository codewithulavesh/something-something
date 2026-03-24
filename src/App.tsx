import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/layouts/DashboardLayout";

// Shared/Common
import Dashboard from "./pages/dashboard/Dashboard";
import Profile from "./pages/dashboard/common/Profile";
import SettingsPage from "./pages/dashboard/common/Settings";
import Reviews from "./pages/dashboard/common/Reviews";

// Student
import StudentBrowse from "./pages/dashboard/student/BrowseProjects";
import MyBids from "./pages/dashboard/student/MyBids";
import StudentMilestones from "./pages/dashboard/student/Milestones";
import StudentWorkspace from "./pages/dashboard/student/Workspace";
import StudentPayments from "./pages/dashboard/student/Payments";
import TeamManagement from "./pages/dashboard/student/TeamManagement";

// Company
import PostProject from "./pages/dashboard/company/PostProject";
import ViewBids from "./pages/dashboard/company/ViewBids";
import ActiveProjects from "./pages/dashboard/company/ActiveProjects";
import CompanyMilestones from "./pages/dashboard/company/Milestones";
import CompanyWorkspace from "./pages/dashboard/company/Workspace";
import CompanyPayments from "./pages/dashboard/company/Payments";

// Admin
import AdminUsers from "./pages/dashboard/admin/AdminUsers";
import Analytics from "./pages/dashboard/admin/Analytics";

const queryClient = new QueryClient();

// Role-based component selector wrapper
const RoleRoute = ({ student, company, admin }: { student: any, company: any, admin?: any }) => {
  const { profile } = useAuth();
  if (profile?.role === 'admin' && admin) return admin;
  if (profile?.role === 'company') return company;
  return student;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            
            {/* Dashboard Routes with Layout */}
            <Route path="/dashboard" element={<DashboardLayout><Dashboard /></DashboardLayout>} />
            <Route path="/dashboard/profile" element={<DashboardLayout><Profile /></DashboardLayout>} />
            <Route path="/dashboard/settings" element={<DashboardLayout><SettingsPage /></DashboardLayout>} />
            <Route path="/dashboard/reviews" element={<DashboardLayout><Reviews /></DashboardLayout>} />

            {/* Role Specific Routes */}
            <Route path="/dashboard/projects" element={
              <DashboardLayout>
                <RoleRoute student={<StudentBrowse />} company={<ActiveProjects />} />
              </DashboardLayout>
            } />
            
            <Route path="/dashboard/post-project" element={<DashboardLayout><PostProject /></DashboardLayout>} />
            
            <Route path="/dashboard/bids" element={
              <DashboardLayout>
                <RoleRoute student={<MyBids />} company={<ViewBids />} />
              </DashboardLayout>
            } />

            <Route path="/dashboard/milestones" element={
              <DashboardLayout>
                <RoleRoute student={<StudentMilestones />} company={<CompanyMilestones />} />
              </DashboardLayout>
            } />

            <Route path="/dashboard/workspace" element={
              <DashboardLayout>
                <RoleRoute student={<StudentWorkspace />} company={<CompanyWorkspace />} />
              </DashboardLayout>
            } />

            <Route path="/dashboard/payments" element={
              <DashboardLayout>
                <RoleRoute student={<StudentPayments />} company={<CompanyPayments />} />
              </DashboardLayout>
            } />

            {/* Student Only */}
            <Route path="/dashboard/teams" element={<DashboardLayout><TeamManagement /></DashboardLayout>} />
            <Route path="/dashboard/won-projects" element={<DashboardLayout><StudentBrowse /></DashboardLayout>} />
            <Route path="/dashboard/deliverables" element={<DashboardLayout><StudentMilestones /></DashboardLayout>} />
            <Route path="/dashboard/earnings" element={<DashboardLayout><StudentPayments /></DashboardLayout>} />

            {/* Company Only */}
            <Route path="/dashboard/select-leader" element={<DashboardLayout><ViewBids /></DashboardLayout>} />

            {/* Admin Only */}
            <Route path="/dashboard/analytics" element={<DashboardLayout><Analytics /></DashboardLayout>} />
            <Route path="/dashboard/users" element={<DashboardLayout><AdminUsers /></DashboardLayout>} />
            <Route path="/dashboard/companies" element={<DashboardLayout><AdminUsers /></DashboardLayout>} />
            <Route path="/dashboard/disputes" element={<DashboardLayout><Analytics /></DashboardLayout>} />
            <Route path="/dashboard/verification" element={<DashboardLayout><Analytics /></DashboardLayout>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
