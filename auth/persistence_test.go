package auth

import (
	"testing"

	"github.com/aoiasakawa/aoitube/core/data"
	"github.com/aoiasakawa/aoitube/core/user"
)

func TestMain(m *testing.M) {
	if err := data.SetupPersistence(":memory:"); err != nil {
		panic(err)
	}
	user.SetupUsers()
	Setup(data.GetDatastore())
	// The account-merge path touches these tables; create them for the tests
	// (the full server creates them at startup).
	data.CreateMessagesTable(data.GetDatastore().DB)
	data.CreateDonationsTable(data.GetDatastore().DB)
	m.Run()
}

// TestSoftDeleteAndReactivation covers the governance invariant: unlinking is a
// soft delete (kept as history), and re-authenticating with the same account
// reactivates the original link and recovers the original user identity.
func TestSoftDeleteAndReactivation(t *testing.T) {
	u, _, err := user.CreateAnonymousUser("gov-tester")
	if err != nil {
		t.Fatal(err)
	}

	const token = "google:123"
	if err := SetSoleProviderAuth(u.ID, token, Google, "tester@example.com", ActorSelf); err != nil {
		t.Fatal(err)
	}

	if got := GetUserByAuth(token, Google); got == nil || got.ID != u.ID {
		t.Fatalf("expected active link to resolve to user %s", u.ID)
	}

	// Unlink (soft delete).
	remaining, err := RevokeProviderAuth(u.ID, Google, ActorSelf)
	if err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Errorf("expected 0 remaining active links, got %d", remaining)
	}
	if got := GetUserByAuth(token, Google); got != nil {
		t.Fatal("revoked link must not resolve via the active lookup")
	}

	// Self-view is empty; admin view retains the revoked link as history.
	if d := GetUserAuthDetails(u.ID); len(d) != 0 {
		t.Errorf("expected no active auth details, got %d", len(d))
	}
	admin := GetUserAuthDetailsForAdmin(u.ID)
	if len(admin) != 1 || !admin[0].Revoked {
		t.Fatalf("expected one revoked link in the admin view, got %+v", admin)
	}

	// A USER-initiated unlink is durable: re-authenticating on the login path
	// must NOT silently reactivate it (that would let whoever next controls the
	// social account reclaim the identity).
	if got := FindLinkedUser(token, Google, ActorSelf); got != nil {
		t.Fatal("a user-unlinked link must not auto-reactivate on login")
	}

	// The operator can still restore it explicitly (manual recovery).
	if !ReactivateAuth(u.ID, token, Google, ActorAdmin) {
		t.Fatal("expected admin reactivation to succeed")
	}
	if got := GetUserByAuth(token, Google); got == nil || got.ID != u.ID {
		t.Fatal("expected link to be active again after admin reactivation")
	}
	if d := GetUserAuthDetails(u.ID); len(d) != 1 {
		t.Errorf("expected one active auth detail after reactivation, got %d", len(d))
	}
}

// TestOverwriteRevokesPreviousAccount verifies that linking a different account
// of the same provider revokes the previous one (one active per provider) while
// keeping it recoverable.
func TestOverwriteRevokesPreviousAccount(t *testing.T) {
	u, _, err := user.CreateAnonymousUser("gov-tester-2")
	if err != nil {
		t.Fatal(err)
	}
	if err := SetSoleProviderAuth(u.ID, "google:A", Google, "a@example.com", ActorSelf); err != nil {
		t.Fatal(err)
	}
	if err := SetSoleProviderAuth(u.ID, "google:B", Google, "b@example.com", ActorSelf); err != nil {
		t.Fatal(err)
	}

	if got := GetUserByAuth("google:B", Google); got == nil {
		t.Fatal("account B should be the active Google link")
	}
	if got := GetUserByAuth("google:A", Google); got != nil {
		t.Fatal("account A should have been revoked by the overwrite")
	}
	if active := GetUserAuthDetails(u.ID); len(active) != 1 {
		t.Fatalf("expected exactly one active link, got %d", len(active))
	}

	// A is recoverable, and reactivating it revokes B (invariant preserved).
	if got := FindLinkedUser("google:A", Google, ActorSelf); got == nil || got.ID != u.ID {
		t.Fatal("expected account A to reactivate to the original user")
	}
	if got := GetUserByAuth("google:B", Google); got != nil {
		t.Fatal("reactivating A should revoke B to keep one active per provider")
	}
}

// TestAuditLogRecordsEvents verifies the append-only audit log captures the
// link/unlink/reactivate lifecycle with the acting party.
func TestAuditLogRecordsEvents(t *testing.T) {
	u, _, err := user.CreateAnonymousUser("gov-audit")
	if err != nil {
		t.Fatal(err)
	}
	const token = "github:42"
	if err := SetSoleProviderAuth(u.ID, token, GitHub, "octocat", ActorSelf); err != nil {
		t.Fatal(err)
	}
	if _, err := RevokeProviderAuth(u.ID, GitHub, ActorSelf); err != nil {
		t.Fatal(err)
	}
	// Operator restores it (login-path auto-reactivation is disabled for
	// user-unlinked links, so use the admin recovery path).
	if !ReactivateAuth(u.ID, token, GitHub, ActorAdmin) {
		t.Fatal("expected admin reactivation to succeed")
	}

	events := GetAuthEvents(u.ID)
	if len(events) < 3 {
		t.Fatalf("expected at least 3 audit events (linked, unlinked, reactivated), got %d", len(events))
	}
	// Newest first.
	if events[0].Action != ActionReactivated {
		t.Errorf("expected newest event to be %q, got %q", ActionReactivated, events[0].Action)
	}
	// Every event names its actor and the provider.
	for _, e := range events {
		if e.Actor == "" || e.Type != string(GitHub) {
			t.Errorf("event missing actor/type: %+v", e)
		}
	}
}

// TestMergeUserAuths verifies auth links and audit history move to the target
// and the one-active-per-provider invariant is preserved.
func TestMergeUserAuths(t *testing.T) {
	src, _, err := user.CreateAnonymousUser("gov-merge-src")
	if err != nil {
		t.Fatal(err)
	}
	dst, _, err := user.CreateAnonymousUser("gov-merge-dst")
	if err != nil {
		t.Fatal(err)
	}
	if err := SetSoleProviderAuth(src.ID, "discord:1", Discord, "src#1", ActorSelf); err != nil {
		t.Fatal(err)
	}
	if err := SetSoleProviderAuth(dst.ID, "x:2", X, "@dst", ActorSelf); err != nil {
		t.Fatal(err)
	}

	if err := MergeUsers(src.ID, dst.ID, ActorAdmin); err != nil {
		t.Fatal(err)
	}

	// The Discord link now resolves to the target user.
	if got := GetUserByAuth("discord:1", Discord); got == nil || got.ID != dst.ID {
		t.Fatalf("expected merged Discord link to resolve to target %s", dst.ID)
	}
	// The target has both providers active; the source has none.
	if d := GetUserAuthDetails(dst.ID); len(d) != 2 {
		t.Errorf("expected target to have 2 active links, got %d", len(d))
	}
	if d := GetUserAuthDetails(src.ID); len(d) != 0 {
		t.Errorf("expected source to have 0 active links, got %d", len(d))
	}
	// The append-only audit log is NOT rewritten: the source keeps its own
	// history (its original "linked" event plus the merge marker).
	srcEvents := GetAuthEvents(src.ID)
	if len(srcEvents) < 2 {
		t.Errorf("expected source to retain its own history, got %d events", len(srcEvents))
	}
	// The merge markers cross-reference the counterpart user (H2 linkage).
	var srcMerge *AuthEvent
	for i := range srcEvents {
		if srcEvents[i].Action == ActionMerged {
			srcMerge = &srcEvents[i]
			break
		}
	}
	if srcMerge == nil || srcMerge.Handle != dst.ID {
		t.Errorf("expected source merge marker to reference target %s, got %+v", dst.ID, srcMerge)
	}
}
