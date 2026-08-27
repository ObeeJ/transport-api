// Package social handles posts, follows, claps, reshares, streaks, and feed.
package social

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Post struct {
	ID         uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	AuthorID   uuid.UUID      `gorm:"type:uuid;not null" json:"authorId"`
	Kind       string         `gorm:"not null" json:"kind"`
	Body       string         `gorm:"type:text;not null" json:"body"`
	MediaKeys  []string       `gorm:"serializer:json" json:"mediaKeys,omitempty"`
	Refs       map[string]any `gorm:"serializer:json" json:"refs,omitempty"`
	CircleID   *uuid.UUID     `gorm:"type:uuid" json:"circleId,omitempty"`
	Visibility string         `gorm:"not null;default:public" json:"visibility"`
	CreatedAt  time.Time      `json:"createdAt"`
	Score      float64        `json:"score"`
	Hidden     bool           `json:"-"`
}

func (Post) TableName() string { return "posts" }

func (p *Post) BeforeCreate(_ *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}

type Streak struct {
	UserID      uuid.UUID  `gorm:"type:uuid;not null" json:"userId"`
	Kind        string     `gorm:"not null" json:"kind"`
	Count       int        `gorm:"not null;default:0" json:"count"`
	LastHitAt   *time.Time `json:"lastHitAt,omitempty"`
	FreezesLeft int        `gorm:"not null;default:1" json:"freezesLeft"`
}

func (Streak) TableName() string { return "streaks" }

// CreatePost inserts a new post.
func CreatePost(db *gorm.DB, authorID uuid.UUID, kind, body string, visibility string, refs map[string]any) (*Post, error) {
	p := &Post{
		AuthorID:   authorID,
		Kind:       kind,
		Body:       body,
		Visibility: visibility,
		Refs:       refs,
	}
	return p, db.Create(p).Error
}

// Feed returns ranked posts for a user.
func Feed(db *gorm.DB, userID uuid.UUID, tab string, limit int) ([]Post, error) {
	var posts []Post
	q := db.Where("hidden = false")
	switch tab {
	case "following":
		q = q.Where("author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)", userID)
	case "circle":
		q = q.Where("circle_id IS NOT NULL")
	default: // foryou
		q = q.Where("visibility = 'public'")
	}
	return posts, q.Order("score DESC, created_at DESC").Limit(limit).Find(&posts).Error
}

// Clap upserts a clap count (1–50) for a post.
func Clap(db *gorm.DB, postID, userID uuid.UUID, count int) error {
	if count < 1 {
		count = 1
	}
	if count > 50 {
		count = 50
	}
	return db.Exec(`INSERT INTO post_claps(post_id, user_id, count, updated_at)
		VALUES(?,?,?,NOW()) ON CONFLICT(post_id,user_id) DO UPDATE SET count=EXCLUDED.count, updated_at=NOW()`,
		postID, userID, count).Error
}

// ToggleFollow follows or unfollows a user.
func ToggleFollow(db *gorm.DB, followerID, followeeID uuid.UUID) (following bool, err error) {
	var count int64
	db.Raw("SELECT COUNT(*) FROM follows WHERE follower_id=? AND followee_id=?", followerID, followeeID).Scan(&count)
	if count > 0 {
		return false, db.Exec("DELETE FROM follows WHERE follower_id=? AND followee_id=?", followerID, followeeID).Error
	}
	return true, db.Exec("INSERT INTO follows(follower_id,followee_id,created_at) VALUES(?,?,NOW()) ON CONFLICT DO NOTHING",
		followerID, followeeID).Error
}

// IncrementStreak bumps a streak counter for a user+kind.
func IncrementStreak(db *gorm.DB, userID uuid.UUID, kind string) error {
	now := time.Now()
	s := Streak{UserID: userID, Kind: kind, Count: 1, LastHitAt: &now, FreezesLeft: 1}
	return db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "kind"}},
		DoUpdates: clause.Assignments(map[string]any{"count": gorm.Expr("streaks.count + 1"), "last_hit_at": now}),
	}).Create(&s).Error
}

// GetStreaks returns all streaks for a user.
func GetStreaks(db *gorm.DB, userID uuid.UUID) ([]Streak, error) {
	var streaks []Streak
	return streaks, db.Where("user_id = ?", userID).Find(&streaks).Error
}
