# UI guide

What the web application at `http://localhost:4180` does, as observed in a browser against the running stack. Use it to decide what to test through the user interface and what to leave to API tests. The API is described in [API-GUIDE.md](API-GUIDE.md); how to run the stack is in [ENV-README.md](../../ENV-README.md).

## 1. How to read this guide

**What was observed.** The application is the Vue frontend `vue-realworld-example-app` at commit `f7e48c8`, built to talk to `http://localhost:4181/api`. Pages were driven and read in a real Chromium-based browser: the page's text and DOM were read, form fields were filled and buttons clicked, and every HTTP call the page made was logged. The behaviour is the same on every run unless a rule says it changes.

**Evidence labels.** Every rule carries one of these labels:

| Label | Meaning |
|---|---|
| **observed** | done in the live application, result seen. |
| **from source, not run** | read in the frontend's source, not triggered. |
| **not triggered** | the interface could show it but it never appeared. |

**Rule IDs.** Rules are numbered `UI-001`, `UI-002`, and so on. **An ID is never renumbered or reused once released; new rules only get new numbers.** A rule that stops being true is marked retired and keeps its number.

**Possible defects.** Behaviour that looks like a defect is labelled **possible defect**, with how to reproduce it.

**Names used.** `<user>` is a username, `<slug>` an article slug. Texts in quotes are exact. "The error list" is the red list of messages under the page title (a `ul` with the class `error-messages`); each entry is the field name followed by the server's message, for example `email can't be blank`.

## 2. Routes

The application is a single-page app. There are exactly ten routes. The browser's address changes without a page load.

| Route | Page | Needs a login | An anonymous visitor gets |
|---|---|---|---|
| `/` | Home: global feed, and "Your Feed" when logged in | no (`/?feed=following` yes) | the page; `/?feed=following` redirects to `/login` |
| `/tag/:tag` | Home filtered by a tag | no | the page |
| `/login` | Sign in | no | the page |
| `/register` | Sign up | no | the page |
| `/settings` | Your Settings | **yes** | redirect to `/login` |
| `/profile/:username` | a user's profile, "My Articles" tab | no | the page |
| `/profile/:username/favorites` | the profile's "Favorited Articles" tab | no | the page |
| `/article/:slug` | one article and its comments | no | the page (actions send to `/login`) |
| `/editor` | write a new article | **yes** | redirect to `/login` |
| `/editor/:slug` | edit an article | **yes** | redirect to `/login` |

| ID | Rule | Evidence |
|---|---|---|
| UI-001 | `/settings`, `/editor`, `/editor/<slug>` and `/?feed=following` redirect an anonymous visitor to `/login`. The address becomes `/login` with no `redirect` query. A visitor who is logged in sees the page. | observed |
| UI-002 | A route that does not exist (`/nope`) shows the header and footer with an empty page between them; there is no "not found" page. | observed |
| UI-003 | `/profile/<unknown user>` and its `/favorites` show the text "This profile could not be loaded. Please try again later." | observed |
| UI-004 | `/article/<unknown slug>` shows an article page with empty title and the broken texts "Follow undefined", "Favorite Article (undefined)". **Possible defect.** Reproduce: open `/article/does-not-exist`. | observed |
| UI-005 | `/tag/<tag>` with a tag that no article has shows the tag as a tab and the text "No articles are here... yet." | observed |
| UI-006 | The address bar of every page shows the route as typed. Reloading a page keeps the user logged in (the token is in the browser's local storage under the key `jwtToken`) and shows the same page. | observed |
| UI-007 | The page title (`<title>`) is "Conduit" on every route and does not change. | observed |

## 3. Pages

### 3.1 Header and footer

| ID | Rule | Evidence |
|---|---|---|
| UI-008 | The header has the links "conduit" (to `/`) and "Home" (to `/`). An anonymous visitor also sees "Sign in" (`/login`) and "Sign up" (`/register`). A logged-in user sees "New Article" (`/editor`), "Settings" (`/settings`) and a link with their avatar and username (to `/profile/<user>`) instead. | observed |
| UI-009 | The footer shows "conduit", the text "An interactive learning project from Thinkster. Code & design licensed under MIT." and a link "Thinkster" to https://thinkster.io. | observed |
| UI-010 | Every route change in a logged-in session makes the page call `GET /api/user` first (the page checks the login on every navigation). After a page load the token in local storage is a fresh one (its expiry moves 5 minutes ahead). | observed |

### 3.2 Home (`/` and `/tag/:tag`)

| ID | Rule | Evidence |
|---|---|---|
| UI-011 | An anonymous visitor sees a banner with "conduit" and "A place to share your knowledge." A logged-in user does not see the banner. | observed |
| UI-012 | Tabs: an anonymous visitor has "Global Feed". A logged-in user has "Your Feed" and "Global Feed"; "Global Feed" is the active tab at first. On `/tag/<tag>` a third tab with the tag's name is added and is active. | observed |
| UI-013 | The global feed lists articles newest first, **10 per page** (`GET /api/articles?offset=0&limit=10`). Each entry shows the author's avatar and name (a link to the profile), the date as "October 15, 2026", the favorite button with the count, the title (a link to `/article/<slug>`), the description, "Read more..." and the tags. | observed |
| UI-014 | Pagination appears below the list when there is more than one page: a button per page, numbered from 1, the current one marked active (an `li` with `data-test="page-link-<n>"`). The address gets `?page=<n>` and the page calls `GET /api/articles?offset=<(n-1)*10>&limit=10`. A page beyond the last (`?page=99`) shows "No articles are here... yet." with the buttons; `?page=0` and `?page=abc` show page 1. | observed |
| UI-015 | "Popular Tags" in the sidebar lists **every** tag the API returns (in creation order), each a link to `/tag/<tag>`. A tag made only of spaces or an empty tag appears as an empty or blank link. | observed |
| UI-016 | A click on a tag, in the sidebar or on an article, opens `/tag/<tag>` and calls `GET /api/articles?offset=0&limit=10&tag=<tag>`. | observed |
| UI-017 | "Your Feed" (`/?feed=following`) calls `GET /api/articles/feed?offset=0&limit=10` and lists the articles of the users the logged-in user follows. | observed |
| UI-018 | An empty list shows "No articles are here... yet." inside an element with the class `article-preview`, like a real article. An empty "Your Feed" shows two such elements: "Your feed is empty. Go to the Global Feed to discover articles." and "No articles are here... yet." | observed |
| UI-019 | The favorite button on an entry shows the count. Clicking it as an anonymous visitor goes to `/login` (with no `redirect`). Logged in, it calls `POST /api/articles/<slug>/favorite` (or `DELETE`) and the button changes between the outline and the filled style and the count changes by one. | observed |
| UI-020 | After a reload the list shows favorited articles as **not** favorited (outline button) although the count includes the favorite, because the list API ignores the login. **Possible defect.** Reproduce: favorite an article from the home list, reload. | observed |

### 3.3 Sign in (`/login`) and sign up (`/register`)

| ID | Rule | Evidence |
|---|---|---|
| UI-021 | The sign-in page has the heading "Sign in", a link "Need an account?" (to `/register`), the fields **Email** (placeholder "Email") and **Password**, and the button "Sign in". | observed |
| UI-022 | The sign-up page has the heading "Sign up", a link "Have an account?" (to `/login`), the fields **Username**, **Email**, **Password** (placeholders), and the button "Sign up". | observed |
| UI-023 | Sign in success: the page goes to `/` (or to the path in the `redirect` query, see UI-024), the header changes to the logged-in header, the token is saved. It calls `POST /api/users/login` and then `GET /api/user`. | observed |
| UI-024 | `/login?redirect=<path>` and `/register?redirect=<path>` return to `<path>` after success when it is a path of this site (`/login?redirect=/article/<slug>` lands on that article). A `redirect` to another site (`https://example.org/x`) is ignored and the page goes to `/`. The "Sign in" and "sign up" links under an anonymous article's comments carry `?redirect=/article/<slug>`. | observed |
| UI-025 | Sign up success: logged in and on `/`. It calls `POST /api/users`, then `GET /api/user`. | observed |

### 3.4 Settings (`/settings`)

| ID | Rule | Evidence |
|---|---|---|
| UI-026 | "Your Settings" has five fields in this order: **URL of profile picture**, **Your username**, **Short bio about you** (a multi-line box), **Email**, **Password**, then "Update Settings" and a button "Or click here to logout." The fields are filled from the current user; the password is empty. | observed |
| UI-027 | "Update Settings" calls `PUT /api/user` and, on success, goes to `/profile/<username>` (the new username if it was changed). | observed |
| UI-028 | "Or click here to logout." clears the token and goes to `/`; the header is the anonymous one. | observed |

### 3.5 Profile (`/profile/:username`, `/profile/:username/favorites`)

| ID | Rule | Evidence |
|---|---|---|
| UI-029 | The profile shows the avatar, the username and the bio, and the tabs "My Articles" (`/profile/<user>`) and "Favorited Articles" (`/profile/<user>/favorites`). On your own profile there is a link "Edit Profile Settings" (to `/settings`); on someone else's there is a button "Follow <user>" (or "Unfollow <user>"). An anonymous visitor sees the Follow button too. | observed |
| UI-030 | The lists have **5 per page** (`GET /api/articles?offset=0&limit=5&author=<user>`, and `&favorited=<user>`). An empty list shows "No articles are here... yet." | observed |
| UI-031 | The Follow button on a profile calls `POST` or `DELETE /api/profiles/<user>/follow`; the label changes between "Follow <user>" and "Unfollow <user>". | observed |

### 3.6 Article (`/article/:slug`)

| ID | Rule | Evidence |
|---|---|---|
| UI-032 | The page shows a banner (title, author avatar and link, date, action buttons) and the same action buttons again below the body. The body is rendered from Markdown (bold, links, paragraphs); HTML such as `<b>` is kept; a `<script>` element is removed and does not run. The tags follow the body. | observed |
| UI-033 | A logged-in user who is not the author sees "Follow <author>" and "Favorite Article (<n>)" (after a favorite: "Unfavorite Article (<n>)"). The author sees "Edit Article" (to `/editor/<slug>`) and "Delete Article" instead. | observed |
| UI-034 | "Favorite Article" calls `POST /api/articles/<slug>/favorite` and updates the label and count; the second click calls `DELETE`. | observed |
| UI-035 | "Delete Article" calls `DELETE /api/articles/<slug>` and goes to `/`; the article is gone from the list. There is no confirmation. | observed |
| UI-036 | **Follow on the article page is broken.** Opened by clicking from a home list, "Follow <author>" calls `POST /api/profiles/undefined/follow` and gets `404`; the label does not change. After visiting the author's profile first, the label shows the right state, but the button always calls `POST .../follow`: the first click works, later clicks (also when the label says "Unfollow") answer `409` and nothing changes. **Possible defect.** Reproduce: log in, open an article of someone else from the home list, click "Follow <author>"; then open the author's profile, return to the article and click twice. | observed |
| UI-037 | An anonymous visitor sees "Sign in or sign up to add comments on this article." in place of the comment box. Clicking "Follow" or "Favorite" goes to `/login`. | observed |
| UI-038 | A logged-in user sees a text box (placeholder "Write a comment...") and "Post Comment". Posting calls `POST /api/articles/<slug>/comments`, adds the comment to the list and empties the box. An empty box shows the error "body Input should be a valid string" (the page sends no text). A box with only spaces is accepted and posted. | observed |
| UI-039 | Each comment shows its text, the author's avatar and name (link), and the date. Only the logged-in user's **own** comments have a trash icon (`i.ion-trash-a`); clicking the icon calls `DELETE /api/articles/<slug>/comments/<id>` and removes the comment. There is no confirmation. The article's author does not get a trash icon on other users' comments, although the API would allow it. | observed |
| UI-040 | Comments are listed oldest first (the API sends newest first): a comment added later appears below the earlier ones. | observed |

### 3.7 Editor (`/editor`, `/editor/:slug`)

| ID | Rule | Evidence |
|---|---|---|
| UI-041 | The editor has the fields **Article Title**, **What's this article about?**, **Write your article (in markdown)** (a multi-line box) and **Enter tags**, and the button "Publish Article". `/editor/<slug>` opens with the current values and calls `GET /api/articles/<slug>`. | observed |
| UI-042 | In the tag field, pressing Enter adds the text as a tag (the field empties) and shows it as a tag below. **Text typed but not confirmed with Enter is not saved.** A tag already in the list is added again, and an empty or space-only tag is added too (they are sent to the API and stored). A small cross on a tag removes every tag with that text. | observed |
| UI-043 | "Publish Article" on a new article calls `POST /api/articles` and goes to `/article/<slug>` of the new article; on an existing one it calls `PUT /api/articles/<slug>` and goes to `/article/<new slug>` (the slug follows a changed title). | observed |

## 4. Field rules and error messages

Errors come from the server and are shown in the error list at the top of the form. A field the user never touched is sent as an empty value or as nothing, which decides the message.

### 4.1 Sign in

| ID | Case | Result shown | Evidence |
|---|---|---|---|
| UI-044 | both fields untouched, click "Sign in" | `email Input should be a valid string`, `password Input should be a valid string` (`POST /api/users/login` answers `422`) | observed |
| UI-045 | wrong password, unknown email, email in another letter case, a text that is not an email | `credentials invalid` (`401`) | observed |

### 4.2 Sign up

| ID | Case | Result shown | Evidence |
|---|---|---|---|
| UI-046 | all fields untouched | `email can't be blank`, `password can't be blank`, `username can't be blank` | observed |
| UI-047 | not an email address | `email value is not a valid email address: The email address is not valid. It must have exactly one @-sign.` | observed |
| UI-048 | an address ending `@example.test` | `email value is not a valid email address: The part after the @-sign is a special-use or reserved name that cannot be used with email.` | observed |
| UI-049 | a username that exists | `username has already been taken` (`409`) | observed |

### 4.3 Settings

| ID | Case | Result shown | Evidence |
|---|---|---|---|
| UI-050 | username emptied | `username can't be blank` | observed |
| UI-051 | email not an address | two messages: the `function-after[_validate(), str]` message with the same text as UI-047, and `_Empty Input should be a valid dictionary or instance of _Empty` (an internal type name shown to the user). **Possible defect.** | observed |
| UI-052 | a username that another user has | `network Unable to connect to the server` (the API answers `500`); the page stays on `/settings`. **Possible defect:** the user sees a connection error for a server error. | observed |

### 4.4 Article editor

| ID | Case | Result shown | Evidence |
|---|---|---|---|
| UI-053 | all fields empty, "Publish Article" | `title can't be blank`, `description can't be blank`, `body can't be blank` | observed |
| UI-054 | only some fields filled | the same messages for the empty ones only | observed |
| UI-055 | title emptied on an existing article, "Publish Article" | `title can't be blank` | observed |

### 4.5 Comment

| ID | Case | Result shown | Evidence |
|---|---|---|---|
| UI-056 | empty box, "Post Comment" | `body Input should be a valid string` | observed |

## 5. Permission matrix

What the user interface offers (a button or link that is **visible**), by visitor.

| Action | Anonymous | Logged in, not the owner | Owner |
|---|---|---|---|
| Read home, tags, profiles, articles, comments | yes | yes | yes |
| "Your Feed" tab | no | yes | yes |
| Favorite button on a list entry | shown; click goes to `/login` | works | works |
| Follow on a profile | shown; click goes to `/login` | works | not shown (own profile) |
| Follow on an article | shown; click goes to `/login` | shown; broken (UI-036) | not shown (author sees Edit and Delete) |
| Favorite on an article | shown; click goes to `/login` | works | not shown (author sees Edit and Delete) |
| Write a comment | not shown (a "Sign in or sign up" text) | shown | shown |
| Delete a comment | not shown | only on own comments | only on own comments |
| Edit, Delete Article | not shown | not shown | shown |
| `/editor`, `/settings` | redirect to `/login` | open | open |
| `/editor/<slug>` of someone else's article | redirect to `/login` | page opens with the form filled; "Publish Article" answers `403` and shows `article forbidden` | opens |

| ID | Rule | Evidence |
|---|---|---|
| UI-057 | `/editor/<slug>` of an article by another user opens with the article's values filled in, as for its author. "Publish Article" calls `PUT /api/articles/<slug>`, which answers `403`; the page stays on `/editor/<slug>` and the error list shows `article forbidden`. | observed |

## 6. UI to API traceability

Every row was read from the page's own network log. All calls use the API at `http://localhost:4181/api` with the header `Authorization: Token <jwt>` when logged in. The `GET /api/user` call that every navigation makes (UI-010) is not repeated in the rows.

| UI action | HTTP calls | Data effect |
|---|---|---|
| Open home | `GET /api/tags`, `GET /api/articles?offset=0&limit=10` | none |
| Next page `n` | `GET /api/articles?offset=<(n-1)*10>&limit=10` | none |
| Click a tag | `GET /api/articles?offset=0&limit=10&tag=<tag>` | none |
| "Your Feed" | `GET /api/articles/feed?offset=0&limit=10` | none |
| Favorite from a list or the article | `POST /api/articles/<slug>/favorite` | adds the favorite |
| Unfavorite | `DELETE /api/articles/<slug>/favorite` | removes it |
| Sign in | `POST /api/users/login`, `GET /api/user` | new session |
| Sign up | `POST /api/users`, `GET /api/user` | new user and session |
| Settings: Update | `PUT /api/user`, `GET /api/user`, then the profile's calls | updates the user |
| Open a profile | `GET /api/profiles/<user>`, `GET /api/articles?offset=0&limit=5&author=<user>` | none |
| Profile "Favorited Articles" | `GET /api/articles?offset=0&limit=5&favorited=<user>`, `GET /api/profiles/<user>` | none |
| Follow on a profile | `POST /api/profiles/<user>/follow` | follows |
| Follow on an article | `POST /api/profiles/<user>/follow` (`undefined` or a repeated call, UI-036) | none or `409` |
| Open an article | `GET /api/articles/<slug>/comments`, `GET /api/articles/<slug>` | none |
| Post Comment | `POST /api/articles/<slug>/comments` | adds a comment |
| Delete a comment | `DELETE /api/articles/<slug>/comments/<id>` | deletes it |
| Delete Article | `DELETE /api/articles/<slug>` | deletes the article |
| Publish (new) | `POST /api/articles` | creates the article |
| Publish (edit) | `PUT /api/articles/<slug>` | updates it |
| Edit page open | `GET /api/articles/<slug>` | none |

**Which to test where.** Validation messages, limits, permissions and data rules are decided by the API: test them through the API (API-GUIDE.md section 4). The user interface adds: routing and redirects (UI-001, UI-024), what is shown to whom (section 5), the 10 and 5 per page paging, the way the server's messages are displayed (section 4), Markdown rendering and removal of scripts (UI-032), the tag input (UI-042), and the defects of UI-020 and UI-036.

## 7. Testability notes

| ID | Rule | Evidence |
|---|---|---|
| UI-058 | There is no `data-testid` attribute anywhere in the live DOM. The only test hook is `data-test="page-link-<n>"` on the `li` of each pagination button. | observed |
| UI-059 | The inputs have **no `label` elements and no `aria-label`**; find them by placeholder ("Email", "Password", "Username", "Article Title", "What's this article about?", "Write your article (in markdown)", "Enter tags", "Write a comment...", "URL of profile picture", "Your username", "Short bio about you") or by `name` (`email`, `password`, `username`, `title`, `description`, `body`, `image`, `bio`; the tag field and the comment box have none). | observed |
| UI-060 | There are no `id` attributes except `app`. Elements are found by text and by the theme's classes: `.banner`, `.article-preview`, `.tag-pill`, `.tag-list`, `.pagination`, `.sidebar`, `.error-messages`, `.card` (a comment), `.nav-link`, `.btn`. | observed |
| UI-061 | Pages have the landmarks `nav` and `footer` but no `main` or `header` element. Images (avatars) have **no `alt`**. Icons are `i` elements with `ion-*` classes and no text. The page language is `en`. | observed |
| UI-062 | The error list is a `ul.error-messages`; it is present on every form and is empty when there is no error. Each message is one `li` with the field name and the message in one text. | observed |
| UI-063 | Data loads after the page: the list, the tags, the article and the comments each arrive in separate calls a moment after the page appears. Wait for an element (an article title, "No articles are here... yet.") rather than for the route. | observed |
| UI-064 | Values that change on every run: the slug suffix when a title already exists, dates (the day, formatted "October 15, 2026"), comment ids, tokens, and everything that depends on the database content (the tag list, the number of pages). | observed |
| UI-065 | The page loads two stylesheets (`code.ionicframework.com`, `fonts.googleapis.com`) and fonts from third-party hosts. With the network blocked the page works; icons and fonts fall back. | observed |
| UI-066 | The token is kept in local storage as `jwtToken` and is replaced by a fresh one on every page load. It lasts 5 minutes. A page loaded after more than 5 minutes behaves as described in UI-067. | observed |
| UI-067 | When a page is loaded (or reloaded) more than 5 minutes after the token was last refreshed, the login check fails and the page behaves as for an anonymous visitor: loading `/settings` ended on `/login` with the anonymous header (the text "Connecting…" is briefly in the header), and the expired token stays in local storage. | observed |
| UI-068 | A browser `fetch` to the API is made with `Accept: application/json`; the frontend does not cache API calls. | from source, not run |

## 8. What can be tested

A checklist by rule ID. One line is one test idea; there is no test code here.

- **Routing and redirects:** UI-001 to UI-007, UI-024, UI-066, UI-067.
- **Header, footer, banner and tabs:** UI-008 to UI-012.
- **Home lists and paging:** UI-013 to UI-019 (10 per page; pager data-test hooks).
- **Auth forms:** UI-021 to UI-025, UI-044 to UI-049.
- **Settings:** UI-026 to UI-028, UI-050 to UI-052.
- **Profile:** UI-029 to UI-031 (5 per page).
- **Article page:** UI-032 to UI-040, UI-056.
- **Editor:** UI-041 to UI-043, UI-053 to UI-055.
- **Permissions:** section 5.
- **Possible defects**, to pin with a known-issue label: UI-004, UI-020, UI-036, UI-051, UI-052.
- **Editor on another user's article:** UI-057.
