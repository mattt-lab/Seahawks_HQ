import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Schedule from './pages/Schedule.jsx';
import Roster from './pages/Roster.jsx';
import Franchise from './pages/Franchise.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/roster" element={<Roster />} />
        <Route path="/franchise" element={<Franchise />} />
      </Route>
    </Routes>
  );
}
