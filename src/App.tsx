import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TimetableProvider } from "@/contexts/TimetableContext";
import AppLayout from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import DataInput from "./pages/DataInput";
import Generate from "./pages/Generate";
import ViewTimetable from "./pages/ViewTimetable";
import FacultyTimetable from "./pages/FacultyTimetable";
import ExportPage from "./pages/Export";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <TimetableProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/input" element={<DataInput />} />
              <Route path="/generate" element={<Generate />} />
              <Route path="/view" element={<ViewTimetable />} />
              <Route path="/faculty-view" element={<FacultyTimetable />} />
              <Route path="/export" element={<ExportPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TimetableProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
