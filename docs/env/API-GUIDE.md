# API guide

What the API of this stack does, as observed against the running stack. Use it to decide what to test and what to expect. How to run the stack: [ENV-README.md](../../ENV-README.md). The user interface is in [UI-GUIDE.md](UI-GUIDE.md).

## 1. How to read this guide

**Where.** The API answers at `http://localhost:4181`. The RealWorld operations are under `/api/`; six extra operations are under `/auth/`; the OpenAPI document is `/openapi.json` and the interactive docs are `/docs`. Requests and responses are JSON (`Content-Type: application/json`). Dates are ISO 8601 with milliseconds and a `Z` suffix (`2026-10-15T11:58:49.742Z`). The behaviour below is that of backend commit `04ef47c` (Django 5.2.1, django-ninja 1.4.1).

**Evidence labels.** Every rule carries one of these labels:

| Label | Meaning |
|---|---|
| **observed** | run against the live stack, result seen. |
| **from source, not run** | read in the pinned backend source, not triggered. |
| **not triggered** | the contract snapshot lists a status code that the API never returned. |

**Rule IDs.** Rules are numbered `API-001`, `API-002`, and so on. **An ID is never renumbered or reused once released; new rules only get new numbers.** A rule that turns out to be wrong or that stops being true is marked as retired in this file, and keeps its number.

**Placeholders.** `<jwt>` is a token. Examples use `curl`; replace `<jwt>` with a token from a registration or login. Responses below are trimmed to the relevant part. Names such as `alice` are examples.

**Possible defects.** Behaviour that looks like a defect is labelled **possible defect** with its reproduction. It is described here because tests will meet it; this guide does not say whether it should be fixed.

## 2. Authentication and errors

### 2.1 Getting and sending a token

| ID | Rule | Evidence |
|---|---|---|
| API-001 | `POST /api/users` (register) and `POST /api/users/login` return a `token` inside the `user` object. `GET /api/user` and `PUT /api/user` also return a `token`. | observed |
| API-002 | The token is a JWT signed with HS256. Its payload has the keys `type` (`access`), `exp`, `user_id` and `session_id`. | observed |
| API-003 | A token expires 300 seconds (5 minutes) after it was issued (`exp` is issue time plus 300 s). | observed |
| API-004 | Every registration, login, `GET /api/user` and `PUT /api/user` returns a new token, and every issued token adds a session to `GET /auth/sessions/`. Earlier tokens stay valid until they expire or their session is deleted. A token keeps working after the user's password was changed. | observed |
| API-005 | The header formats `Authorization: Token <jwt>` and `Authorization: Bearer <jwt>` are both accepted, on every endpoint. The scheme word is case-sensitive: `token`, `bearer`, `JWT`, `Basic`, a bare token, and `Token ` with nothing after it are all treated as no token at all. | observed |

```bash
curl -s http://localhost:4181/api/user -H "Authorization: Token <jwt>"
```

### 2.2 What each kind of endpoint does with a bad token

Three kinds of endpoint exist, by how they treat the `Authorization` header.

| Kind | Endpoints | No token or an unusable scheme | A token that is garbage, truncated, tampered, expired or whose session was deleted |
|---|---|---|---|
| **Required** | `GET` and `PUT /api/user`, `POST /api/articles`, `PUT` and `DELETE /api/articles/{slug}`, `GET /api/articles/feed`, `POST` and `DELETE` of favorites, follows and comments, all of `/auth/` except login and refresh | `401` `{"errors": {"token": ["is missing"]}}` | `500` with an HTML body (**possible defect**) |
| **Optional** | `GET /api/profiles/{username}`, `GET /api/articles/{slug}`, `GET /api/articles/{slug}/comments` | treated as anonymous, `200` | treated as anonymous, `200` |
| **Ignored** | `GET /api/articles`, `GET /api/tags`, `POST /api/users`, `POST /api/users/login` | works; a valid token is **not** used | works; the token is not used |

| ID | Rule | Evidence |
|---|---|---|
| API-006 | On a required endpoint a missing token (including an unusable scheme) gives `401` with `{"errors": {"token": ["is missing"]}}`. | observed |
| API-007 | On a required endpoint a token that is garbage, truncated, has a tampered signature, has two spaces after the scheme, is expired (older than 300 s) or belongs to a deleted session gives `500` with the Django HTML error page, not `401`. **Possible defect.** Reproduce: `curl -i http://localhost:4181/api/user -H "Authorization: Token garbage"`. | observed |
| API-008 | On an optional endpoint any token problem is treated as "anonymous": the request succeeds and `following` and `favorited` are `false`. | observed |
| API-009 | `GET /api/articles` does not read the token at all, even a valid one: every article in the list has `favorited: false` and `author.following: false`. The same article read with `GET /api/articles/{slug}` or in the feed with the same token has the right values. **Possible defect.** | observed |

### 2.3 Error bodies and status conventions

| ID | Rule | Evidence |
|---|---|---|
| API-010 | Errors from the application have the shape `{"errors": {"<name>": ["<message>", ...]}}`. | observed |
| API-011 | `401`: no usable token on a required endpoint (`token` is missing), or wrong credentials at login (`{"errors": {"credentials": ["invalid"]}}`). | observed |
| API-012 | `403`: the caller is logged in but not allowed (`{"errors": {"article": ["forbidden"]}}`, `{"comment": ["forbidden"]}`, `{"profile": ["forbidden"]}`). | observed |
| API-013 | `404`: a thing does not exist: `{"errors": {"article": ["not found"]}}`, `{"profile": ["not found"]}`, `{"comment": ["not found"]}`. | observed |
| API-014 | `409`: a conflict. Registration with a taken username or email (`{"errors": {"username": ["has already been taken"]}}`), following someone already followed, unfollowing someone not followed (the last two with the body `null`). | observed |
| API-015 | `422`: validation of a field. The key is the field name (`title`, `email`, ...). The messages are in section 4. A missing wrapper key gives `{"errors": {"user": ["Field required"]}}` (or `article`, `comment`); a missing body gives `{"errors": {"data": ["Field required"]}}`. | observed |
| API-016 | `400`: a body that is not valid JSON, or not sent as JSON, gives `{"detail": "Cannot parse request body"}`. This `detail` shape is different from the `errors` shape. | observed |
| API-017 | `405` with the plain text `Method not allowed` (content type `text/html`) for a method the path does not have (`DELETE /api/tags`, `POST /api/tags`); `HEAD /api/tags` gives `405` with no body. | observed |
| API-018 | An unknown URL, and any `/api/...` path with a trailing slash that the API does not define (`/api/articles/<slug>/`), gives `404` with an HTML page, not JSON. | observed |
| API-019 | `500` always comes with an HTML body. The cases that reach it are listed in section 7. | observed |
| API-020 | An `OPTIONS` preflight (for `PUT /api/user` from another origin) answers `200`, and a request with an `Origin` header from any site gets `access-control-allow-origin: *`. | observed |

## 3. Endpoint reference

The operations are in the order of the contract snapshot's tags. For each: auth, request, success, errors that were triggered, one example, notes. Statuses not listed for an endpoint in section 8's table were not triggered.

### 3.1 The 19 RealWorld operations

#### POST /api/users: register

- **Auth:** none (a token is ignored).
- **Request:** `{"user": {"username": "...", "email": "...", "password": "..."}}`, all three required. Extra fields (for example `bio`) are ignored.
- **Success:** `201` with `{"user": {"username": "alice", "email": "alice@example.com", "bio": null, "image": null, "token": "<jwt>"}}`.
- **Errors:** `422` field errors (section 4.1), `409` taken username or email, `400` unparsable body.

```bash
curl -s -X POST http://localhost:4181/api/users -H "Content-Type: application/json" -d '{"user":{"username":"alice","email":"alice@example.com","password":"secret-123"}}'
```

Notes: API-001, API-004, API-014, API-021 to API-030.

#### POST /api/users/login: log in

- **Auth:** none.
- **Request:** `{"user": {"email": "...", "password": "..."}}`. The identifier is the **email**; a username does not work.
- **Success:** `200`, same body as registration.
- **Errors:** `401` `{"errors": {"credentials": ["invalid"]}}` for a wrong password, an unknown email, an email in a different letter case, or a username used as the email; `422` for a blank or missing field.

```bash
curl -s -X POST http://localhost:4181/api/users/login -H "Content-Type: application/json" -d '{"user":{"email":"alice@example.com","password":"secret-123"}}'
```

Notes: API-031, API-032.

#### GET /api/user: the current user

- **Auth:** required.
- **Success:** `200` `{"user": {"email": "alice@example.com", "bio": null, "image": null, "username": "alice", "token": "<jwt>"}}`.
- **Errors:** `401` (no token), `500` (bad token, API-007). The snapshot's `404` never occurred.

```bash
curl -s http://localhost:4181/api/user -H "Authorization: Token <jwt>"
```

#### PUT /api/user: update the current user

- **Auth:** required.
- **Request:** `{"user": {...}}` with any of `email`, `username`, `bio`, `image`, `password`. Only the fields that are present change (it behaves like a PATCH). `{"user": {}}` changes nothing and returns `200`. Unknown fields are ignored.
- **Success:** `200`, same body as `GET /api/user`.
- **Errors:** `401`, `422` (section 4.2), `500` (API-040 to API-043).

```bash
curl -s -X PUT http://localhost:4181/api/user -H "Authorization: Token <jwt>" -H "Content-Type: application/json" -d '{"user":{"bio":"Hello"}}'
```

Notes: API-033 to API-043.

#### GET /api/profiles/{username}: a profile

- **Auth:** optional (API-008).
- **Success:** `200` `{"profile": {"following": false, "bio": null, "image": null, "username": "alice"}}`. `following` is `true` when the token's user follows this profile.
- **Errors:** `404` `{"errors": {"profile": ["not found"]}}`. The username is case-sensitive; after a username change the old name gives `404`. The snapshot's `401` never occurred.

```bash
curl -s http://localhost:4181/api/profiles/alice
```

#### POST /api/profiles/{username}/follow: follow

- **Auth:** required.
- **Success:** `200` `{"profile": {"following": true, ...}}`.
- **Errors:** `401`; `403` `{"errors": {"profile": ["forbidden"]}}` for following yourself; `404` unknown username; `409` with the body `null` when already following. The snapshot's `400` was not triggered.

```bash
curl -s -X POST http://localhost:4181/api/profiles/alice/follow -H "Authorization: Token <jwt>"
```

#### DELETE /api/profiles/{username}/follow: unfollow

- **Auth:** required.
- **Success:** `200` `{"profile": {"following": false, ...}}`.
- **Errors:** `401`; `403` for yourself; `404` unknown username; `409` with the body `null` when you were not following.

```bash
curl -s -X DELETE http://localhost:4181/api/profiles/alice/follow -H "Authorization: Token <jwt>"
```

Notes: API-075, API-082.

#### GET /api/articles: list articles

- **Auth:** ignored (API-009).
- **Query:** `limit` (default 20), `offset` (default 0), `tag`, `author`, `favorited` (a username). Details in section 5.
- **Success:** `200` `{"articles": [<article without body>], "articlesCount": N}`. An article in a list has the keys `description`, `createdAt`, `updatedAt`, `favorited`, `favoritesCount`, `author`, `tagList`, `slug`, `title`; there is **no `body`**.
- **Errors:** `422` for a non-integer `limit` or `offset`; `500` for a negative one.

```bash
curl -s "http://localhost:4181/api/articles?limit=2&offset=0&tag=news"
```

#### GET /api/articles/feed: the feed

- **Auth:** required.
- **Query:** `limit`, `offset` as above.
- **Success:** `200` `{"articlesCount": N, "articles": [...]}` with the articles of the users you follow, newest first. A user who follows nobody gets `{"articlesCount": 0, "articles": []}`.
- **Errors:** `401`, `422`, `500`. The snapshot's `404` never occurred.

```bash
curl -s "http://localhost:4181/api/articles/feed?limit=10" -H "Authorization: Token <jwt>"
```

#### POST /api/articles: create an article

- **Auth:** required.
- **Request:** `{"article": {"title": "...", "description": "...", "body": "...", "tagList": ["..."]}}`. `title`, `description` and `body` are required; `tagList` is optional.
- **Success:** `201` `{"article": {"description": "...", "body": "...", "createdAt": "...", "updatedAt": "...", "favorited": false, "favoritesCount": 0, "author": {"following": false, "bio": null, "image": null, "username": "alice"}, "tagList": [], "slug": "my-title", "title": "My Title"}}`.
- **Errors:** `401`, `422` (section 4.3), `500` (API-050, API-051). The snapshot's `409` was not triggered: a title that already exists gets a different slug (API-070).

```bash
curl -s -X POST http://localhost:4181/api/articles -H "Authorization: Token <jwt>" -H "Content-Type: application/json" -d '{"article":{"title":"My Title","description":"About","body":"Text","tagList":["news"]}}'
```

#### GET /api/articles/{slug}: one article

- **Auth:** optional (API-008).
- **Success:** `200` `{"article": {...}}` with the `body`.
- **Errors:** `404` `{"errors": {"article": ["not found"]}}`. The slug is case-sensitive.

```bash
curl -s http://localhost:4181/api/articles/my-title
```

#### PUT /api/articles/{slug}: update an article

- **Auth:** required, and the caller must be the author.
- **Request:** `{"article": {...}}` with any of `title`, `description`, `body`, `tagList`. Only the fields present change. `{"article": {}}` is accepted and refreshes `updatedAt`.
- **Success:** `200` `{"article": {...}}`. A new `title` produces a new `slug`; the old slug then gives `404`.
- **Errors:** `401`; `403` `{"errors": {"article": ["forbidden"]}}` for a logged-in non-author on an existing article; `404` for an unknown slug; `422` (blank `title`, `description` or `body`; `tagList` that is not a list); `500` (API-052).

```bash
curl -s -X PUT http://localhost:4181/api/articles/my-title -H "Authorization: Token <jwt>" -H "Content-Type: application/json" -d '{"article":{"body":"New text"}}'
```

#### DELETE /api/articles/{slug}: delete an article

- **Auth:** required, author only.
- **Success:** `204` with an empty body (the response header says `text/html`). The snapshot's `200` never occurred.
- **Errors:** `401`; `403` for a logged-in non-author; `404` for an unknown slug and for a second delete.

```bash
curl -s -X DELETE http://localhost:4181/api/articles/my-title -H "Authorization: Token <jwt>"
```

Notes: API-076.

#### POST /api/articles/{slug}/favorite: favorite

- **Auth:** required. Any logged-in user, including the author, may favorite.
- **Success:** `200` `{"article": {... "favorited": true, "favoritesCount": N}}`.
- **Errors:** `401`; `404` unknown slug; **`500` when the article is already favorited** (API-086, possible defect).

```bash
curl -s -X POST http://localhost:4181/api/articles/my-title/favorite -H "Authorization: Token <jwt>"
```

#### DELETE /api/articles/{slug}/favorite: unfavorite

- **Auth:** required.
- **Success:** `200` `{"article": {... "favorited": false, ...}}`.
- **Errors:** `401`; `404` for an unknown slug and also when the article is not favorited by the caller (same body, `{"errors": {"article": ["not found"]}}`).

```bash
curl -s -X DELETE http://localhost:4181/api/articles/my-title/favorite -H "Authorization: Token <jwt>"
```

#### GET /api/articles/{slug}/comments: list comments

- **Auth:** optional (API-008).
- **Success:** `200` `{"comments": [{"body": "...", "createdAt": "...", "updatedAt": "...", "author": {"following": false, "bio": null, "image": null, "username": "bob"}, "id": 12}, ...]}`, **newest first**. There is no pagination. `id` is a number, unique across all articles. `author.following` is `true` when the token's user follows the comment's author.
- **Errors:** `404` unknown slug.

```bash
curl -s http://localhost:4181/api/articles/my-title/comments
```

#### POST /api/articles/{slug}/comments: add a comment

- **Auth:** required.
- **Request:** `{"comment": {"body": "..."}}`.
- **Success:** `201` `{"comment": {"body": "...", "createdAt": "...", "updatedAt": "...", "author": {...}, "id": 12}}`.
- **Errors:** `401`; `404` unknown slug; `422` (section 4.4).

```bash
curl -s -X POST http://localhost:4181/api/articles/my-title/comments -H "Authorization: Token <jwt>" -H "Content-Type: application/json" -d '{"comment":{"body":"Nice"}}'
```

#### DELETE /api/articles/{slug}/comments/{comment_id}: delete a comment

- **Auth:** required. Allowed for the comment's author and for the author of the article the slug names.
- **Success:** `204`, empty body.
- **Errors:** `401`; `403` `{"errors": {"comment": ["forbidden"]}}`; `404` unknown slug (`article`) or unknown comment (`comment`); `422` when `comment_id` is not an integer.

```bash
curl -s -X DELETE http://localhost:4181/api/articles/my-title/comments/12 -H "Authorization: Token <jwt>"
```

Notes: API-077, API-078, API-084, API-085.

#### GET /api/tags: all tags

- **Auth:** ignored.
- **Success:** `200` `{"tags": ["beta", "alpha", ...]}`: every tag that exists (also tags no article uses any more), each once, in the order the tags were first created (not sorted).

```bash
curl -s http://localhost:4181/api/tags
```

### 3.2 The six extra operations under /auth/ (not RealWorld)

These come from the `jwtninja` package. A RealWorld client does not use them; a coverage tool must exclude them. They use their own token pair, but the access token of `/auth/login/` is accepted by `/api/` endpoints, and the token returned by `/api/users` is accepted by `/auth/sessions/`. They use the header `Authorization: Bearer <jwt>` (the `Token` scheme gives `401`).

| ID | Rule | Evidence |
|---|---|---|
| API-100 | `POST /auth/login/` takes `{"username": "...", "password": "..."}`. The field called `username` must hold the user's **email**: with the real username it answers `500`. Success is `200` `{"access_token": "<jwt>", "refresh_token": "<jwt>"}`. | observed |
| API-101 | `POST /auth/login/` with a wrong password or an unknown user gives `500` (HTML), not `401`. A missing field gives `422`; invalid JSON gives `400`. **Possible defect.** | observed |
| API-102 | `POST /auth/refresh/` with `{"refresh_token": "<jwt>"}` and a valid refresh token gives `200` with a new pair. Using the same refresh token again also gives `200` (no reuse detection was seen, although the snapshot names `token_reuse_detected`). An empty body, a garbage token or an access token gives `500`. **Possible defect.** | observed |
| API-103 | `GET /auth/sessions/` with `Bearer <jwt>` gives `200` and a list of the user's sessions, each `{"id", "created_at", "last_activity_at", "ip_address", "user_agent", "browser", "location", "is_current"}`. Without a token it gives `401`. Every registration, login and token-returning call adds a session. | observed |
| API-104 | `DELETE /auth/sessions/{session_id}/` deletes a session: `200` with an empty body. Deleting the same session again, or an id that does not exist, gives `500`. After a session is deleted its tokens give `500` on required endpoints (API-007). **Possible defect.** | observed |
| API-105 | `POST /auth/logout/` (`Bearer`) gives `200` with an empty body and ends the current session; `POST /auth/logout/all/` ends all of the user's sessions. Their tokens then give `500` on required endpoints. Without a token both give `401`. | observed |

#### POST /auth/login/: log in (extra)

- **Auth:** none. **Request:** `{"username": "<email>", "password": "..."}` (the `username` field holds the email, API-100).
- **Success:** `200` `{"access_token": "<jwt>", "refresh_token": "<jwt>"}`.
- **Errors:** `422` missing field, `400` invalid JSON, `500` wrong password or unknown user (API-101). The snapshot's `401` never occurred.

```bash
curl -s -X POST http://localhost:4181/auth/login/ -H "Content-Type: application/json" -d '{"username":"alice@example.com","password":"secret-123"}'
```

#### POST /auth/refresh/: new tokens (extra)

- **Auth:** none. **Request:** `{"refresh_token": "<jwt>"}`.
- **Success:** `200` `{"access_token": "<jwt>", "refresh_token": "<jwt>"}`; the same refresh token can be used again (API-102).
- **Errors:** `500` for an empty body, a garbage token or an access token. The snapshot's `400` and `401` never occurred.

```bash
curl -s -X POST http://localhost:4181/auth/refresh/ -H "Content-Type: application/json" -d '{"refresh_token":"<jwt>"}'
```

#### GET /auth/sessions/: list sessions (extra)

- **Auth:** required, `Bearer`. **Success:** `200`, a JSON array of `{"id", "created_at", "last_activity_at", "ip_address", "user_agent", "browser", "location", "is_current"}` (API-103).
- **Errors:** `401` no token; `500` bad token (API-007).

```bash
curl -s http://localhost:4181/auth/sessions/ -H "Authorization: Bearer <jwt>"
```

#### DELETE /auth/sessions/{session_id}/: delete a session (extra)

- **Auth:** required, `Bearer`. **Success:** `200`, empty body (API-104).
- **Errors:** `401` no token; `500` for an unknown or already deleted id. The snapshot's `404` never occurred. Deleting a session that belongs to another user was not tried.

```bash
curl -s -X DELETE http://localhost:4181/auth/sessions/<session_id>/ -H "Authorization: Bearer <jwt>"
```

#### POST /auth/logout/: end the current session (extra)

- **Auth:** required, `Bearer`. **Success:** `200`, empty body; the session's tokens then give `500` on required endpoints (API-105). **Errors:** `401`.

```bash
curl -s -X POST http://localhost:4181/auth/logout/ -H "Authorization: Bearer <jwt>"
```

#### POST /auth/logout/all/: end all sessions (extra)

- **Auth:** required, `Bearer`. **Success:** `200`, empty body; every token of the user then gives `500` on required endpoints (API-105). **Errors:** `401`.

```bash
curl -s -X POST http://localhost:4181/auth/logout/all/ -H "Authorization: Bearer <jwt>"
```

## 4. Field rules and error messages

All tests below sent otherwise valid data and changed one field. "Blank" is the empty string. Messages are the exact texts returned.

### 4.1 Registration and login (`POST /api/users`, `POST /api/users/login`)

| ID | Field | Rule and exact result | Evidence |
|---|---|---|---|
| API-021 | `username` | required: missing gives `422` `username: Field required`; blank gives `422` `can't be blank`; not a string gives `Input should be a valid string`. | observed |
| API-022 | `username` | at most 60 characters: 60 is accepted, 61 gives `422` `String should have at most 60 characters`. There is no minimum: one character is accepted. | observed |
| API-023 | `username` | whitespace-only (`"   "`), names with spaces and non-ASCII letters are accepted. Names are case-sensitive: `alice` and `ALICE` are two users. | observed |
| API-024 | `email` | required; blank gives `can't be blank`; a string that is not an address gives `value is not a valid email address: The email address is not valid. It must have exactly one @-sign.` | observed |
| API-025 | `email` | an address on a reserved domain (`@example.test`) is rejected: `value is not a valid email address: The part after the @-sign is a special-use or reserved name that cannot be used with email.` `@example.com` and `@example.org` are accepted. | observed |
| API-026 | `email` | the part before the `@` has at most 64 characters (65 gives `The email address is too long before the @-sign (1 character too many).`); an address of 251 characters was accepted (the snapshot declares a maximum of 254, not tested at the boundary). | observed |
| API-027 | `email` | upper-case letters are kept and compared exactly: `A@EXAMPLE.COM` and `a@example.com` are two accounts, and login requires the same letter case. | observed |
| API-028 | `password` | required; blank gives `can't be blank`; at most 128 characters (129 gives `String should have at most 128 characters`); no minimum, one character and eight spaces are accepted. | observed |
| API-029 | all | extra fields in `user` are ignored. A body that is `{}` gives `{"errors": {"user": ["Field required"]}}`; `{"user": {}}` lists the three missing fields. | observed |
| API-030 | all | a taken username gives `409` `{"errors": {"username": ["has already been taken"]}}`; a taken email gives `409` with `email`. When both are taken the answer names `email`. | observed |
| API-031 | login | the identifier is the email, compared case-sensitively (API-027). A wrong password, an unknown email and a username in the email field all give the same `401`. | observed |
| API-032 | login | blank email or password gives `422` `can't be blank`; a missing field gives `Field required`; lengths above the registration limits were not tested for login. | observed |

### 4.2 Updating the current user (`PUT /api/user`)

| ID | Field | Rule and exact result | Evidence |
|---|---|---|---|
| API-033 | `bio` | any text, no length limit was found (10 000 characters accepted). An empty string or `null` clears it, and the API then returns `null`. | observed |
| API-034 | `image` | any string is accepted (`not a url`). An empty string clears it (`null`). | observed |
| API-035 | `email` | an invalid address gives `422` with the key `function-after[_validate(), str]` (not `email`) and the same message as registration; the empty string gives the same; `null` gives `422` `email: can't be blank`. | observed |
| API-036 | `username` | blank or `null` gives `422` `can't be blank`. Setting your own current username again is accepted. | observed |
| API-037 | `password` | blank or `null` gives `422` `can't be blank`. After a change the old password gives `401` at login and the new one works. | observed |
| API-038 | `email` change | after a change the old email gives `401` at login; the new one works. | observed |
| API-039 | `username` change | after a change `GET /api/profiles/<old>` gives `404`, the new name works, tokens issued before keep working. | observed |
| API-040 | `username` | a username that another user has gives `500` (HTML), not `409`. **Possible defect.** Reproduce: `PUT /api/user` with `{"user": {"username": "<another user>"}}`. | observed |
| API-041 | `email` | an email that another user has gives `500` (HTML), not `409`. **Possible defect.** | observed |
| API-042 | `username` | 61 characters gives `500`, while registration answers `422` for the same value. **Possible defect.** | observed |
| API-043 | `image` | 3 000 characters gives `500`. **Possible defect.** | observed |

### 4.3 Creating and updating articles (`POST` and `PUT /api/articles`)

| ID | Field | Rule and exact result | Evidence |
|---|---|---|---|
| API-044 | `title` | required on create; blank gives `422` `title: can't be blank`; `null` or a number gives `Input should be a valid string`. | observed |
| API-045 | `description`, `body` | required on create; blank gives `can't be blank`; missing gives `Field required`. A whitespace-only `body` (`"   "`) is accepted (a whitespace-only description was not tried). A 20 000-character description and a 100 000-character body are accepted. | observed |
| API-046 | `title` | whitespace-only (`"   "`) is accepted and produces the **empty slug** `""` (possible defect, see API-072). | observed |
| API-047 | `tagList` | a list of strings. `null`, a string or a list of numbers gives `422` (`tagList: Input should be a valid list`, `0: Input should be a valid string`). Duplicates are stored once; tags are case-sensitive (`Alpha` and `alpha` are two tags); the empty string and a tag with spaces are accepted. | observed |
| API-048 | `tagList` | in a response the tags are sorted ascending by character code (so `Alpha` before `alpha`, `""` first). | observed |
| API-049 | `tagList` | 100 characters per tag are accepted. | observed |
| API-050 | `title` | at most 150 characters: 150 is accepted; 151 or 1 000 gives `500` (HTML), not `422`. **Possible defect.** | observed |
| API-051 | `tagList` | a tag of 101 characters gives `500`. **Possible defect.** | observed |
| API-052 | update | on `PUT`, `title: null` gives `500`; a 151-character title gives `500`. **Possible defect.** A blank `title`, `description` or `body` gives `422` `can't be blank`. | observed |
| API-053 | update | `{"article": {}}` is accepted. An unknown slug gives `404` and is checked after the token and before the permission (see section 6). `{}` without `article` gives `422` `article: Field required`. | observed |
| API-054 | update | `tagList: []` removes all tags; `tagList` with values replaces them; `tagList: null` gives `422`. | observed |
| API-055 | extra | unknown fields (`slug`, `author`, `favoritesCount`) are ignored: the slug comes from the title. | observed |

### 4.4 Comments (`POST /api/articles/{slug}/comments`)

| ID | Field | Rule and exact result | Evidence |
|---|---|---|---|
| API-056 | `body` | required: `{}` gives `comment: Field required`, `{"comment": {}}` gives `body: Field required`; blank gives `body: can't be blank`; `null` or a number gives `Input should be a valid string`. | observed |
| API-057 | `body` | whitespace-only is accepted. One character is accepted; 100 000 characters are accepted; Unicode and HTML are stored as sent. | observed |

## 5. Listing behaviour

| ID | Rule | Evidence |
|---|---|---|
| API-058 | `GET /api/articles` and the feed return at most `limit` articles, default **20**, starting at `offset`, default 0. `articlesCount` is the total number of matching articles, not the page size. | observed |
| API-059 | There is no maximum `limit`: `limit=1000` returned all 25 articles of the test author. `limit=0` returns `articles: []` with the real `articlesCount`. | observed |
| API-060 | A negative `limit` or `offset` gives `500` (HTML). **Possible defect.** A non-integer value (`abc`, `2.5`, empty) gives `422` `limit: Input should be a valid integer, unable to parse string as an integer` (same for `offset`). | observed |
| API-061 | An `offset` beyond the end gives `200` with an empty list and the real count. | observed |
| API-062 | The order is newest first (by creation time). The same for the feed. | observed |
| API-063 | `tag`, `author` and `favorited` filter by exact, case-sensitive values and combine with AND. `favorited` is the username of the user who favorited. An unknown value gives `200` with an empty list. An empty `tag=` is ignored. Unknown query parameters are ignored. | observed |
| API-064 | The feed returns the articles of the users the caller follows. A user who follows nobody gets an empty feed; after unfollowing, the author's articles leave the feed. | observed |
| API-065 | In the feed and in `GET /api/articles/{slug}` (with a valid token) `favorited` and `author.following` are correct for the caller. In `GET /api/articles` they are always `false` (API-009). | observed |
| API-066 | `GET /api/articles/{slug}/comments` has no pagination and no filters. | observed |
| API-067 | `GET /api/tags` lists every tag ever created, in creation order, including tags no article uses any more. | observed |

## 6. Permission matrix

Statuses seen for each caller on an **existing** resource. "Owner" is the author of the article or the owner of the comment or account.

| Action | Anonymous | Logged in, not the owner | Owner |
|---|---|---|---|
| Read list, article, comments, tags, profile | 200 | 200 | 200 |
| Create article, comment | 401 | 201 | 201 |
| `PUT` article | 401 | 403 | 200 |
| `DELETE` article | 401 | 403 | 204 |
| `DELETE` comment of someone else's article | 401 | 403 (a stranger) | 204 (as article author, or as comment author) |
| Favorite, unfavorite | 401 | 200 | 200 (an author may favorite their own article) |
| Follow, unfollow another user | 401 | 200 | 403 (yourself) |
| Feed | 401 | 200 | - |
| `GET`, `PUT` `/api/user` | 401 | - | 200 |

| ID | Rule | Evidence |
|---|---|---|
| API-068 | The order of checks is: token, then existence, then permission. `PUT` or `DELETE` of an **unknown** slug gives `401` anonymously, `404` for any logged-in user; `PUT` or `DELETE` of an **existing** article gives `403` to a logged-in non-author. | observed |
| API-069 | A comment can be deleted by its author and by the author of the article **named in the URL**, and by nobody else (`403`). | observed |

## 7. Behaviour notes

| ID | Rule | Evidence |
|---|---|---|
| API-070 | The slug is made from the title: lower case, accents removed (`Café déjà vu` gives `cafe-deja-vu`), punctuation and emoji dropped (`a/b?c=d&e #f` gives `abcde-f`), runs of spaces turned into `-`, underscores kept, leading and trailing spaces trimmed. When the slug already exists (for any user, in any letter case of the title) an 8-hex-character suffix is added: `same-title`, `same-title-cac0cc8c`. The first article with a title gets the plain slug. | observed |
| API-071 | A title with no ASCII letters or digits (`日本語のタイトル`, `!!! ???`) gives the slug `-<8 hex>`, a different one each time. | observed |
| API-072 | A whitespace-only title gives the slug `""` (empty). The article exists, but `GET /api/articles/` is the list URL, so it cannot be fetched, updated or deleted by slug. **Possible defect.** Reproduce: create an article with `"title": "   "`, read `slug` from the response. | observed |
| API-073 | Changing a title changes the slug; the old slug then gives `404`. Updating with the same title keeps the slug; a new title that clashes with another article gets a suffix. | observed |
| API-074 | `createdAt` is set once; `updatedAt` changes on every update, including `{"article": {}}`. | observed |
| API-075 | Following twice gives `409`, unfollowing someone you do not follow gives `409`, following yourself gives `403`. Unfavoriting an article you did not favorite gives `404`. Favoriting twice gives `500` (API-086). | observed |
| API-076 | After an article is deleted, `GET /api/articles/{slug}`, its comments and `DELETE` of its comments give `404`. The comment rows are removed with the article (a database cascade). | observed (the `404`s); from source, not run (the cascade) |
| API-077 | Comment ids are numbers and are unique across all articles. | observed |
| API-078 | A body written as Markdown or HTML is stored and returned unchanged; the API does not render or sanitise it. | observed |
| API-079 | The password is never returned. An email is returned only in the `user` object of the user it belongs to, never in a `profile` or an `author`. | observed |
| API-080 | There is no endpoint to delete a user. | observed |
| API-081 | Every `500` is the Django HTML error page. The cases found: a bad token on a required endpoint (API-007); `PUT /api/user` with a taken username or email, a 61-character username or a 3 000-character image (API-040 to API-043); an article title over 150 characters, a tag over 100 characters, `title: null` on update (API-050 to API-052); favoriting twice (API-086); a negative `limit` or `offset` (API-060); and the `/auth/` cases (API-101, API-102, API-104). | observed |
| API-082 | `following` is correct for the caller in `GET /api/profiles/{username}`, in the `author` of a single article, in the feed and in the `author` of listed comments; it is always `false` in `GET /api/articles` (API-009). | observed |
| API-083 | An article in a list has no `body`; an article from create, read-one, update, favorite and unfavorite has it. | observed |
| API-084 | A comment can be deleted through a wrong slug: `DELETE /api/articles/<slug of article X>/comments/<id of a comment on article Y>` deletes that comment when the caller wrote it (`204`); the slug only has to exist. **Possible defect.** | observed |
| API-085 | A comment returned by `POST` has `author.following: false`; the comments of `GET` carry the caller's follow state for each author. | observed |
| API-086 | `POST /api/articles/{slug}/favorite` on an article the caller already favorited gives `500` (HTML). The backend source answers `409` with `Already Favourited Article`, which the endpoint's declared responses do not allow. **Possible defect.** Reproduce: favorite the same article twice. | observed |

## 8. The contract snapshot against what happened

`contract/openapi.04ef47c.json` lists these response codes. "Seen" are the codes the running API returned.

| Operation | Snapshot lists | Seen | Differences |
|---|---|---|---|
| `POST /api/users` | 201, 400, 409 | 201, 409, 422, 400 (only for unparsable JSON) | `422` is not in the snapshot |
| `POST /api/users/login` | 200, 401 | 200, 401, 422, 400 | `422` not in the snapshot |
| `GET /api/user` | 200, 404 | 200, 401, 500 | `404` never occurred; `401` and `500` not listed |
| `PUT /api/user` | 200, 401 | 200, 401, 422, 500 | `422`, `500` not listed |
| `GET /api/profiles/{username}` | 200, 401, 404 (token required) | 200, 404 | `401` never occurred: the token is optional; the snapshot marks it required |
| `POST` and `DELETE /api/profiles/{username}/follow` | 200, 400, 403, 404, 409 | 200, 401, 403, 404, 409 | `400` not triggered; `401` not listed |
| `GET /api/articles` | 200 (no token) | 200, 422, 500 | `422`, `500` not listed; consistent: the token is ignored |
| `GET /api/articles/feed` | 200, 404 | 200, 401, 422, 500 | `404` never occurred |
| `POST /api/articles` | 201, 409, 422 | 201, 401, 422, 500 | `409` not triggered (slugs get a suffix); `401`, `500` not listed |
| `GET /api/articles/{slug}` | 200, 404 (token required) | 200, 404 | the token is optional; the snapshot marks it required |
| `PUT /api/articles/{slug}` | 200, 401, 403, 404 | 200, 401, 403, 404, 422, 500 | `422`, `500` not listed |
| `DELETE /api/articles/{slug}` | 200, 204, 401, 403, 404 | 204, 401, 403, 404 | `200` never occurred |
| `GET /api/articles/{slug}/comments` | 200 (token required) | 200, 404 | the token is optional; `404` not listed |
| `POST /api/articles/{slug}/comments` | 201 | 201, 401, 404, 422, 500 | only `201` is listed |
| `DELETE /api/articles/{slug}/comments/{comment_id}` | 204 | 204, 401, 403, 404, 422 | only `204` is listed |
| `POST /api/articles/{slug}/favorite` | 200, 404 | 200, 401, 404, 500 | `401` not listed; the `500` on a second favorite |
| `DELETE /api/articles/{slug}/favorite` | 200, 404 | 200, 401, 404 | `401` not listed |
| `GET /api/tags` | 200 | 200 | none |
| `POST /auth/login/` | 200, 401 | 200, 422, 400, 500 | `401` never occurred (wrong credentials give `500`) |
| `POST /auth/refresh/` | 200, 400, 401 | 200, 500 | `400` and `401` never occurred: bad input gives `500` |
| `GET /auth/sessions/` | 200 | 200, 401, 500 | `401`, `500` not listed |
| `DELETE /auth/sessions/{session_id}/` | 200, 404 | 200, 401, 500 | `404` never occurred (an unknown id gives `500`) |
| `POST /auth/logout/` | 200 | 200, 401 | `401` not listed |
| `POST /auth/logout/all/` | 200 | 200, 401 | `401` not listed |

The snapshot also declares field limits that agree with what was seen: username 60 characters, password 128, email 254.

## 9. What can be tested

A checklist by rule ID. Each line is one test idea; there is no test code here.

- **Tokens:** API-001 to API-009 (issue, both header schemes, lifetime, bad-token behaviour per endpoint kind).
- **Errors:** API-010 to API-020 (shapes, statuses, `405`, HTML `404`, CORS).
- **Registration and login:** API-021 to API-032 (every limit and message in section 4.1, duplicates, letter case).
- **Profile update:** API-033 to API-043 (clearing, login after changes, the `500` cases).
- **Articles:** API-044 to API-055, API-070 to API-074, API-076, API-078, API-083 (validation, slugs, tags, update semantics).
- **Comments:** API-056, API-057, API-069, API-077, API-084, API-085.
- **Lists and feed:** API-058 to API-067, API-009.
- **Permissions:** section 6, API-068, API-069.
- **Follow and favorite:** API-075, API-082, API-086.
- **Extras:** API-100 to API-105 (only if you decide to test them; they are not part of RealWorld).
- **Possible defects** to pin with a known-issue label so that they fail on purpose when fixed: API-007, API-009, API-040 to API-043, API-046 and API-072, API-050 to API-052, API-060, API-081, API-084, API-086, API-101, API-102, API-104.
