import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner, toast as sonnerToast } from "@/components/ui/sonner";
import { registerAIFallbackHandler } from "@/lib/ai";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Dashboard from "./pages/Dashboard";
import LiveMonitoring from "./pages/LiveMonitoring";
import Alerts from "./pages/Alerts";
import Cases from "./pages/Cases";
import CaseInvestigation from "./pages/CaseInvestigation";
import Transactions from "./pages/Transactions";
import Analytics from "./pages/Analytics";
import Rules from "./pages/Rules";
import Models from "./pages/Models";
import Graph from "./pages/Graph";
import AIAssistant from "./pages/AIAssistant";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import CustomerOnboarding from "./pages/CustomerOnboarding";
import Customers from "./pages/Customers";
import CustomerProfile from "./pages/CustomerProfile";
import Screening from "./pages/Screening";
import RegulatoryReporting from "./pages/RegulatoryReporting";
import FraudRegister from "./pages/FraudRegister";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

function AIFallbackBridge() {
  useEffect(() => {
    registerAIFallbackHandler((msg) => sonnerToast.warning(msg));
  }, []);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AIFallbackBridge />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/monitoring" element={<LiveMonitoring />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/:caseId" element={<CaseInvestigation />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/models" element={<Models />} />
            <Route path="/graph" element={<Graph />} />
            <Route path="/ai-assistant" element={<AIAssistant />} />
            <Route path="/onboarding" element={<CustomerOnboarding />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerProfile />} />
            <Route path="/screening" element={<Screening />} />
            <Route path="/reporting" element={<RegulatoryReporting />} />
            <Route path="/fraud-register" element={<FraudRegister />} />
            <Route path="/users" element={<Users />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
