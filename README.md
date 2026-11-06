# South Block API (Cloudflare Worker + D1)

Serves the menu and takes form submissions. The Flutter app calls this instead of using hardcoded lists.
Everything is on Cloudflare's free tier for a site this size. Needs Node 18+ (https://nodejs.org).

## Run it on your computer
    npm install
    copy .dev.vars.example .dev.vars        (Mac/Linux: cp .dev.vars.example .dev.vars)   # then edit the two values
    npm run db:migrate:local
    npm run db:seed:local
    npm run dev                              # API at http://localhost:8787
    npm run smoke -- http://localhost:8787   # in a second terminal: 13 checks; ADMIN_TOKEN=<your token> adds 5 more

## Put it online (one time)
1. `npx wrangler login`                      (opens a browser; sign in or create a free Cloudflare account)
2. `npx wrangler d1 create southblock-db`    -> copy the printed `database_id` into wrangler.toml
3. `npm run db:migrate:remote` then `npm run db:seed:remote`
4. `npx wrangler secret put ADMIN_TOKEN`     (paste a long random string; it protects /api/admin/*)
   `npx wrangler secret put IP_SALT`         (any long random string)
5. In wrangler.toml set `ALLOWED_ORIGINS` to your site, e.g. "https://southblock.pages.dev" (not "*")
6. `npm run deploy`                          -> prints https://southblock-api.<you>.workers.dev
7. `npm run smoke -- https://southblock-api.<you>.workers.dev`

Then point the Flutter app at it: `flutter run -d chrome --dart-define=API_BASE_URL=https://southblock-api.<you>.workers.dev`
(step 5 of the plan wires the app to these endpoints; step 9 deploys the Flutter web build to Cloudflare Pages).

## Endpoints
Public (GET, cached 60 s)
    /api/health
    /api/menu                  all 17 categories with items (what the app loads at startup)
    /api/categories            list + itemCount
    /api/categories/:id        one category, items in order, with `section` headings
    /api/home                  home chips, each with `icon` and `items` for the carousel
    /api/search?q=warrior      name/description search (max 30)
    /api/testimonials   /api/locations   /api/content (hero words, promo, perks, values...)
Forms (POST JSON; field errors come back as 422 {"error", "errors": {"field": "message"}})
    /api/catering        name, email, guests (10-1000) [phone, eventDate YYYY-MM-DD, message]
    /api/careers/apply   name, email, position [phone, locationId, availability, message]
    /api/contact         name, email, message (5-2000) [subject]
    /api/rewards/signup  email [name]
    Hidden field `website` must stay empty (bots fill it). Max 5 submissions/hour per visitor (429).
Admin (header `Authorization: Bearer <ADMIN_TOKEN>`)
    GET   /api/admin/submissions?type=catering|applications|contact|signups&limit=50
    PATCH /api/admin/items/:id   {"priceCents":1150,"calories":520,"imageUrl":"https://...","description":"...","isActive":false}
Item `id` equals the Flutter `Item.imageKey` (e.g. warrior-bowl, wrap-tandoori-chicken) and each item
includes `photoName`, so photo lookups match the app.

## Edit content without redeploying
    npx wrangler d1 execute southblock-db --remote --command "UPDATE locations SET name='Main St', address='12 Real St' WHERE id='downtown'"
    curl -X PATCH $API/api/admin/items/warrior-bowl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"priceCents":1150}'
`seed/seed.sql` reloads the content tables (not the submissions), so re-running it resets menu text and the 3 example locations.
Locations and testimonials are placeholders: replace them before launch.
