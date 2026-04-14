package worktree

import (
	"path/filepath"
	"sync"
)

// Manager holds one lazily-built *Service per project.
type Manager struct {
	mu       sync.Mutex
	services map[string]*Service
}

func NewManager() *Manager {
	return &Manager{services: make(map[string]*Service)}
}

// For returns the Service for projectID, building it lazily from repoDir.
// Subsequent calls with the same projectID return the cached instance.
// worktreeBase is derived as a sibling directory of repoDir suffixed with
// "-agent-worktrees" (e.g. repoDir "/tmp/my-app" → base "/tmp/my-app-agent-worktrees").
func (m *Manager) For(projectID, repoDir string) *Service {
	m.mu.Lock()
	defer m.mu.Unlock()
	if svc, ok := m.services[projectID]; ok {
		return svc
	}
	base := filepath.Join(filepath.Dir(repoDir), filepath.Base(repoDir)+"-agent-worktrees")
	svc := NewService(repoDir, base)
	m.services[projectID] = svc
	return svc
}

// Remove drops the cached service for projectID. A later For call rebuilds.
func (m *Manager) Remove(projectID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.services, projectID)
}
