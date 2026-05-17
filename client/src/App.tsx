import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Caseload from './pages/Caseload';
import CaseDetail from './pages/CaseDetail';
import Worklist from './pages/Worklist';
import Templates from './pages/Templates';
import Settings from './pages/Settings';
import Communication from './pages/Communication';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/caseload" element={<Caseload />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/worklist" element={<Worklist />} />
          <Route path="/communication" element={<Communication />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
