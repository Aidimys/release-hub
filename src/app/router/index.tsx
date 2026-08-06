import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { LoginPage } from '../../pages/LoginPage';
import { RegisterPage } from '../../pages/RegisterPage';
import { WorkspacesPage } from '../../pages/WorkspacesPage';
import { WorkspaceDetailsPage } from '../../pages/WorkspaceDetailsPage';
import { ReleaseDetailsPage } from '../../pages/ReleaseDetailsPage';
import { ProductDetailsPage } from '../../pages/ProductDetailsPage';
import { PublicReleaseNotesPage } from '../../pages/PublicReleaseNotesPage';
import { AcceptInvitePage } from '../../pages/AcceptInvitePage';
import { NotFoundPage } from '../../pages/NotFoundPage';

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Публичные маршруты */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/public/releases/:productId" element={<PublicReleaseNotesPage />} />

        {/* Защищенные маршруты */}
        <Route element={<ProtectedRoute />}>
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailsPage />} />
          <Route path="/workspaces/:workspaceId/products/:productId" element={<ProductDetailsPage />} />
          <Route path="/workspaces/:workspaceId/releases/:releaseId" element={<ReleaseDetailsPage />} />
        </Route>

        {/* Редирект с корня на воркспейсы */}
        <Route path="/" element={<Navigate to="/workspaces" replace />} />

        {/* 404 Ошибка */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};