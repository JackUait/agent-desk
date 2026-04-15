package card_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/attachment"
	"github.com/jackuait/agent-desk/backend/internal/card"
	"github.com/jackuait/agent-desk/backend/internal/domain"
	"github.com/jackuait/agent-desk/backend/internal/project"
	"github.com/jackuait/agent-desk/backend/internal/worktree"
)

// fakeAttachmentLister is a stub AttachmentLister for handler tests.
type fakeAttachmentLister struct {
	byCard map[string][]attachment.Attachment
}

func (f *fakeAttachmentLister) List(cardID string) ([]attachment.Attachment, error) {
	return f.byCard[cardID], nil
}

// noopGit satisfies project.Git without touching the filesystem.
type noopGit struct{}

func (noopGit) IsRepo(path string) bool { return true }
func (noopGit) Init(path string) error  { return nil }

func newHandler() *card.Handler {
	store := card.NewStore()
	svc := card.NewService(store)
	agentMgr := agent.NewManager("echo")
	worktreeMgr := worktree.NewManager()
	projStore := project.NewStore(noopGit{})
	return card.NewHandler(svc, agentMgr, worktreeMgr, projStore)
}

func newHandlerWithSvc() (*card.Handler, *card.Service) {
	store := card.NewStore()
	svc := card.NewService(store)
	agentMgr := agent.NewManager("echo")
	worktreeMgr := worktree.NewManager()
	projStore := project.NewStore(noopGit{})
	return card.NewHandler(svc, agentMgr, worktreeMgr, projStore), svc
}

func TestCreateCard(t *testing.T) {
	h := newHandler()
	body := strings.NewReader(`{"projectId":"proj-test","title":"My Task"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}
	var c card.Card
	if err := json.NewDecoder(rec.Body).Decode(&c); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if c.ID == "" {
		t.Error("expected non-empty ID")
	}
	if c.Title != "My Task" {
		t.Errorf("expected title %q, got %q", "My Task", c.Title)
	}
	if c.Column != card.ColumnBacklog {
		t.Errorf("expected column %q, got %q", card.ColumnBacklog, c.Column)
	}
}

func TestCreateCard_RequiresProjectID(t *testing.T) {
	h := newHandler()
	body := strings.NewReader(`{"title":"no project"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateCard_AcceptsProjectID(t *testing.T) {
	h := newHandler()
	body := strings.NewReader(`{"projectId":"proj-abc","title":"task"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}
	var c card.Card
	if err := json.NewDecoder(rec.Body).Decode(&c); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if c.ProjectID != "proj-abc" {
		t.Errorf("expected ProjectID %q, got %q", "proj-abc", c.ProjectID)
	}
}

func TestListCards(t *testing.T) {
	h := newHandler()
	// create two cards first
	for _, title := range []string{"Alpha", "Beta"} {
		body := strings.NewReader(`{"projectId":"proj-test","title":"` + title + `"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
		rec := httptest.NewRecorder()
		h.CreateCard(rec, req)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/cards?projectId=proj-test", nil)
	rec := httptest.NewRecorder()
	h.ListCards(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var cards []card.Card
	if err := json.NewDecoder(rec.Body).Decode(&cards); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(cards) != 2 {
		t.Errorf("expected 2 cards, got %d", len(cards))
	}
}

func TestListCards_RequiresProjectIDParam(t *testing.T) {
	h := newHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/cards", nil)
	rec := httptest.NewRecorder()
	h.ListCards(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListCards_FiltersByProjectID(t *testing.T) {
	h := newHandler()
	// create one card in proj-a and one in proj-b
	for _, pid := range []string{"proj-a", "proj-b"} {
		body := strings.NewReader(`{"projectId":"` + pid + `","title":"task"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
		rec := httptest.NewRecorder()
		h.CreateCard(rec, req)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/cards?projectId=proj-a", nil)
	rec := httptest.NewRecorder()
	h.ListCards(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var cards []card.Card
	if err := json.NewDecoder(rec.Body).Decode(&cards); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(cards) != 1 {
		t.Errorf("expected 1 card for proj-a, got %d", len(cards))
	}
}

func TestGetCard(t *testing.T) {
	h := newHandler()
	body := strings.NewReader(`{"projectId":"proj-test","title":"Find Me"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)

	var created card.Card
	json.NewDecoder(rec.Body).Decode(&created)

	req2 := httptest.NewRequest(http.MethodGet, "/api/cards/"+created.ID, nil)
	req2.SetPathValue("id", created.ID)
	rec2 := httptest.NewRecorder()
	h.GetCard(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec2.Code)
	}
	var got card.Card
	json.NewDecoder(rec2.Body).Decode(&got)
	if got.ID != created.ID {
		t.Errorf("expected ID %q, got %q", created.ID, got.ID)
	}
}

func TestGetCard_EnrichesAttachments(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	lister := &fakeAttachmentLister{byCard: map[string][]attachment.Attachment{}}
	agentMgr := agent.NewManager("echo")
	worktreeMgr := worktree.NewManager()
	projStore := project.NewStore(noopGit{})
	h := card.NewHandlerWithAttachments(svc, agentMgr, worktreeMgr, projStore, lister)

	c := svc.CreateCard("proj-x", "has files")
	lister.byCard[c.ID] = []attachment.Attachment{
		{Name: "a.txt", Size: 4, MIMEType: "text/plain", UploadedAt: 1},
		{Name: "b.png", Size: 9, MIMEType: "image/png", UploadedAt: 2},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/cards/"+c.ID, nil)
	req.SetPathValue("id", c.ID)
	rec := httptest.NewRecorder()
	h.GetCard(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got card.Card
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got.Attachments) != 2 {
		t.Fatalf("expected 2 attachments, got %d", len(got.Attachments))
	}
	if got.Attachments[0].Name != "a.txt" || got.Attachments[1].Name != "b.png" {
		t.Errorf("unexpected attachment names: %+v", got.Attachments)
	}
}

func TestListCards_EnrichesAttachments(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	lister := &fakeAttachmentLister{byCard: map[string][]attachment.Attachment{}}
	agentMgr := agent.NewManager("echo")
	worktreeMgr := worktree.NewManager()
	projStore := project.NewStore(noopGit{})
	h := card.NewHandlerWithAttachments(svc, agentMgr, worktreeMgr, projStore, lister)

	c1 := svc.CreateCard("proj-y", "c1")
	c2 := svc.CreateCard("proj-y", "c2")
	lister.byCard[c1.ID] = []attachment.Attachment{{Name: "x.pdf", Size: 1, MIMEType: "application/pdf", UploadedAt: 1}}
	lister.byCard[c2.ID] = []attachment.Attachment{}

	req := httptest.NewRequest(http.MethodGet, "/api/cards?projectId=proj-y", nil)
	rec := httptest.NewRecorder()
	h.ListCards(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var got []card.Card
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 cards, got %d", len(got))
	}
	byID := map[string]card.Card{}
	for _, c := range got {
		byID[c.ID] = c
	}
	if len(byID[c1.ID].Attachments) != 1 || byID[c1.ID].Attachments[0].Name != "x.pdf" {
		t.Errorf("c1 expected 1 attachment x.pdf, got %+v", byID[c1.ID].Attachments)
	}
	if len(byID[c2.ID].Attachments) != 0 {
		t.Errorf("c2 expected 0 attachments, got %+v", byID[c2.ID].Attachments)
	}
}

func TestGetCardNotFound(t *testing.T) {
	h := newHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/cards/nope", nil)
	req.SetPathValue("id", "nope")
	rec := httptest.NewRecorder()
	h.GetCard(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteCard(t *testing.T) {
	h := newHandler()
	body := strings.NewReader(`{"projectId":"proj-test","title":"Delete Me"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)

	var created card.Card
	json.NewDecoder(rec.Body).Decode(&created)

	req2 := httptest.NewRequest(http.MethodDelete, "/api/cards/"+created.ID, nil)
	req2.SetPathValue("id", created.ID)
	rec2 := httptest.NewRecorder()
	h.DeleteCard(rec2, req2)

	if rec2.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec2.Code)
	}

	// confirm it's gone
	req3 := httptest.NewRequest(http.MethodGet, "/api/cards/"+created.ID, nil)
	req3.SetPathValue("id", created.ID)
	rec3 := httptest.NewRecorder()
	h.GetCard(rec3, req3)
	if rec3.Code != http.StatusNotFound {
		t.Errorf("expected 404 after delete, got %d", rec3.Code)
	}
}

func TestListMessages_EmptyArray_ForNewCard(t *testing.T) {
	h, svc := newHandlerWithSvc()
	c := svc.CreateCard("proj-test", "msg card")

	req := httptest.NewRequest(http.MethodGet, "/api/cards/"+c.ID+"/messages", nil)
	req.SetPathValue("id", c.ID)
	rec := httptest.NewRecorder()
	h.ListMessages(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	body := strings.TrimSpace(rec.Body.String())
	if body != "[]" {
		t.Fatalf("expected body %q, got %q", "[]", body)
	}
}

func TestListMessages_ReturnsPersistedMessages(t *testing.T) {
	h, svc := newHandlerWithSvc()
	c := svc.CreateCard("proj-test", "msg card")
	if err := svc.AppendMessage(c.ID, domain.Message{ID: "m1", Role: "user", Content: "hi", Timestamp: 1}); err != nil {
		t.Fatalf("AppendMessage: %v", err)
	}
	if err := svc.AppendMessage(c.ID, domain.Message{ID: "m2", Role: "assistant", Content: "hello", Timestamp: 2}); err != nil {
		t.Fatalf("AppendMessage: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/cards/"+c.ID+"/messages", nil)
	req.SetPathValue("id", c.ID)
	rec := httptest.NewRecorder()
	h.ListMessages(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var msgs []domain.Message
	if err := json.NewDecoder(rec.Body).Decode(&msgs); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].ID != "m1" || msgs[0].Role != "user" || msgs[0].Content != "hi" {
		t.Fatalf("first message mismatch: %+v", msgs[0])
	}
	if msgs[1].ID != "m2" || msgs[1].Role != "assistant" || msgs[1].Content != "hello" {
		t.Fatalf("second message mismatch: %+v", msgs[1])
	}
}

func TestListMessages_404ForUnknownCard(t *testing.T) {
	h := newHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/cards/ghost/messages", nil)
	req.SetPathValue("id", "ghost")
	rec := httptest.NewRecorder()
	h.ListMessages(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteCardNotFound(t *testing.T) {
	h := newHandler()
	req := httptest.NewRequest(http.MethodDelete, "/api/cards/ghost", nil)
	req.SetPathValue("id", "ghost")
	rec := httptest.NewRecorder()
	h.DeleteCard(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
