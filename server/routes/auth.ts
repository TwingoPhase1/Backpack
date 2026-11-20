import { Router } from "express";
import { authService } from "../services/authService.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { triggerInitialUserSync } from "../services/scheduler.js";

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password, otpCode, preferredMethod, totpSecret, grid, save2FA } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Identifiant et mot de passe requis." });
    }

    const result = await authService.login(username, password, {
      otpCode,
      preferredMethod,
      totpSecret,
      grid,
      save2FA,
    });

    if (result.requires2FA) {
      return res.json(result);
    }

    if (result.token) {
      res.setHeader("Set-Cookie", `cartable_token=${result.token}; Path=/; Max-Age=2592000; SameSite=Lax`);
      const creds = authService.getUserCredentials(result.token);
      if (creds) {
        void triggerInitialUserSync(creds.username, creds.password);
      }
    }
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message || "Échec de l'authentification ENT." });
  }
});

// POST /api/auth/verify-2fa
router.post("/verify-2fa", async (req, res) => {
  try {
    const { challengeId, method, code, totpSecret, grid, save2FA } = req.body;
    if (!challengeId || !method) {
      return res.status(400).json({ error: "challengeId et méthode 2FA requis." });
    }

    const { token, user } = await authService.verify2FA(challengeId, {
      method,
      code,
      totpSecret,
      grid,
      save2FA,
    });

    res.setHeader("Set-Cookie", `cartable_token=${token}; Path=/; Max-Age=2592000; SameSite=Lax`);
    const creds = authService.getUserCredentials(token);
    if (creds) {
      void triggerInitialUserSync(creds.username, creds.password);
    }
    res.json({ token, user });
  } catch (error: any) {
    res.status(401).json({ error: error.message || "Échec de la validation 2FA." });
  }
});

// GET /api/auth/2fa/config
router.get("/2fa/config", requireAuth, (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Session non authentifiée." });
  res.json(req.user.twoFactor || { preferredMethod: "passcode_grid", hasGrid: false, hasTotp: false });
});

// POST /api/auth/2fa/config
router.post("/2fa/config", requireAuth, (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Session non authentifiée." });
    const { preferredMethod, totpSecret, grid, clearTotp, clearGrid } = req.body;
    const updatedUser = authService.updateUser2FA(req.user.username, {
      preferredMethod,
      totpSecret,
      grid,
      clearTotp,
      clearGrid,
    });
    if (!updatedUser) {
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }
    res.json({ success: true, user: updatedUser });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Erreur mise à jour 2FA." });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  if (req.credentials) {
    void triggerInitialUserSync(req.credentials.username, req.credentials.password);
  }
  res.json(req.user);
});

// POST /api/auth/accept-terms
router.post("/accept-terms", requireAuth, (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Session non authentifiée." });
    }
    const version = (req.body.version as string) || "1.0";
    const updatedUser = authService.acceptTerms(req.user.username, version);
    if (!updatedUser) {
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }
    res.json({ success: true, user: updatedUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/logout
router.post("/logout", requireAuth, (req, res) => {
  if (req.authToken) {
    authService.logout(req.authToken);
  }
  res.setHeader("Set-Cookie", "cartable_token=; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ success: true, message: "Déconnexion réussie." });
});

// GET /api/auth/admin/users (Admin uniquement)
router.get("/admin/users", requireAuth, requireAdmin, (req, res) => {
  try {
    const users = authService.getAllUsers();
    res.json({ users, total: users.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
