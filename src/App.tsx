import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/layouts/DashboardLayout";

// Shared Logic Entry
import Dashboard from "./pages/dashboard/Dashboard";

// Student Pages
import StudentProfile from "./pages/dashboard/student/StudentProfile";
import StudentBrowse from "./pages/dashboard/student/BrowseProjects";
import MyBids from "./pages/dashboard/student/MyBids";
import StudentMilestones from "./pages/dashboard/student/Milestones";
import StudentWorkspace from "./pages/dashboard/student/Workspace";
import StudentPayments from "./pages/dashboard/student/Payments";
import TeamManagement from "./pages/dashboard/student/TeamManagement";
import StudentReviews from "./pages/dashboard/student/StudentReviews";
import StudentSettings from "./pages/dashboard/student/StudentSettings";

// Company Pages
import CompanyProfile from "./pages/dashboard/company/CompanyProfile";
import PostProject from "./pages/dashboard/company/PostProject";
import ViewBids from "./pages/dashboard/company/ViewBids";
import ActiveProjects from "./pages/dashboard/company/ActiveProjects";
import CompanyMilestones from "./pages/dashboard/company/Milestones";
import CompanyWorkspace from "./pages/dashboard/company/Workspace";
import CompanyPayments from "./pages/dashboard/company/Payments";
import CompanyReviews from "./pages/dashboard/company/CompanyReviews";
import CompanySettings from "./pages/dashboard/company/CompanySettings";

// Admin Pages
import AdminProfile from "./pages/dashboard/admin/AdminProfile";
import AdminUsers from "./pages/dashboard/admin/AdminUsers";
import Analytics from "./pages/dashboard/admin/Analytics";
import AdminSettings from "./pages/dashboard/admin/AdminSettings";

const queryClient = new QueryClient();

// Dynamic Component Router based on current user role
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
            
            {/* Dashboard Root */}
            <Route path="/dashboard" element={<DashboardLayout><Dashboard /></DashboardLayout>} />

            {/* Profile - Role Specific */}
            <Route path="/dashboard/profile" element={
              <DashboardLayout>
                <RoleRoute student={<StudentProfile />} company={<CompanyProfile />} admin={<AdminProfile />} />
              </DashboardLayout>
            } />

            {/* Settings - Role Specific */}
            <Route path="/dashboard/settings" element={
              <DashboardLayout>
                <RoleRoute student={<StudentSettings />} company={<CompanySettings />} admin={<AdminSettings />} />
              </DashboardLayout>
            } />

            {/* Reviews - Role Specific */}
            <Route path="/dashboard/reviews" element={
              <DashboardLayout>
                <RoleRoute student={<StudentReviews />} company={<CompanyReviews />} />
              </DashboardLayout>
            } />

            {/* Projects/Bids - Role Specific */}
            <Route path="/dashboard/projects" element={
              <DashboardLayout>
                <RoleRoute student={<StudentBrowse />} company={<ActiveProjects />} />
              </DashboardLayout>
            } />
            
            <Route path="/dashboard/bids" element={
              <DashboardLayout>
                <RoleRoute student={<MyBids />} company={<ViewBids />} />
              </DashboardLayout>
            } />

            {/* Workflow - Role Specific */}
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

            {/* Student Specific URLs */}
            <Route path="/dashboard/teams" element={<DashboardLayout><TeamManagement /></DashboardLayout>} />
            <Route path="/dashboard/won-projects" element={<DashboardLayout><StudentBrowse /></DashboardLayout>} />
            <Route path="/dashboard/deliverables" element={<DashboardLayout><StudentMilestones /></DashboardLayout>} />
            <Route path="/dashboard/earnings" element={<DashboardLayout><StudentPayments /></DashboardLayout>} />

            {/* Company Specific URLs */}
            <Route path="/dashboard/post-project" element={<DashboardLayout><PostProject /></DashboardLayout>} />
            <Route path="/dashboard/select-leader" element={<DashboardLayout><ViewBids /></DashboardLayout>} />

            {/* Admin Specific URLs */}
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
