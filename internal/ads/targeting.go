package ads

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// EligibleForAds reports whether a user should ever be served an ad.
// Circle members never see ads — that's a purchased benefit, not a targeting
// rule, so it lives here rather than in feed_algo's ranking logic.
func EligibleForAds(isCircleMember bool) bool {
	return !isCircleMember
}

// NextForUser picks one active ad to serve, favoring the least-spent ad so
// budget spreads across the advertiser pool instead of one ad exhausting
// while others sit untouched. Returns nil (no error) if nothing is servable —
// no approved ads, or every ad's budget is exhausted.
func NextForUser(db *gorm.DB, userID uuid.UUID) (*Ad, error) {
	var candidates []Ad
	err := db.Where("status = 'active' AND spent_kobo + ? <= budget_kobo", CostPerImpressionKobo).
		Order("spent_kobo ASC").
		Limit(5).
		Find(&candidates).Error
	if err != nil || len(candidates) == 0 {
		return nil, err
	}
	// Spread across the top-5 least-spent candidates rather than always
	// serving the very cheapest, so a single ad doesn't monopolize every load.
	idx := int(userID[0]) % len(candidates)
	return &candidates[idx], nil
}
