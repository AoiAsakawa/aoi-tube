package utils

import (
	"strings"

	"github.com/microcosm-cc/bluemonday"
	"golang.org/x/net/html"
)

// StripHTML will strip HTML tags from a string.
func StripHTML(s string) string {
	p := bluemonday.NewPolicy()
	return p.Sanitize(s)
}

// MakeSafeStringOfLength will take a string and strip HTML tags,
// trim whitespace, and limit the length.
func MakeSafeStringOfLength(s string, length int) string {
	newString := s
	newString = StripHTML(newString)

	// Decode HTML entities the sanitizer escaped so text doesn't render
	// double-escaped, e.g. "&amp;" showing literally (upstream #3743).
	newString = htmlUnescape(newString)

	// Truncate by runes, not bytes, so multi-byte characters are not cut
	// mid-character into invalid UTF-8.
	if runes := []rune(newString); len(runes) > length {
		newString = string(runes[:length])
	}

	newString = strings.ReplaceAll(newString, "\r", "")
	newString = strings.TrimSpace(newString)

	return newString
}

// htmlUnescape decodes HTML entities while keeping only text content, so
// decoded markup can never re-introduce tags.
func htmlUnescape(input string) string {
	token := html.NewTokenizer(strings.NewReader(input))
	var output strings.Builder

	for {
		tt := token.Next()
		switch tt {
		case html.ErrorToken:
			return output.String()
		case html.TextToken:
			text := string(token.Text())
			output.WriteString(text)
		}
	}
}
