# MentorMeet — Implementation Plan & System Prompt за Claude Code

**Верзија:** 1.0  
**Тип на проект:** Full-stack веб-апликација за закажување менторски сесии  
**Frontend:** React + TypeScript + Vite  
**Backend:** Node.js + Express + TypeScript  
**Database:** PostgreSQL  
**ORM:** Prisma  
**Цел:** Функционална, тестирана и подготвена за deployment апликација.

---

# ДЕЛ I — IMPLEMENTATION PLAN

## 1. Опис на проектот

MentorMeet е веб-апликација за закажување индивидуални менторски сесии. Првичната верзија ќе има еден host (ментор) кој ги објавува достапните термини, додека посетителите можат да изберат термин и да резервираат сесија со своето име и email.

Апликацијата треба да има модерен и едноставен интерфејс, функционален backend, PostgreSQL база и REST API.

### Главни функционалности

1. Host dashboard за прегледување термини и резервации.
2. Креирање нови термини со датум, време и времетраење.
3. Прикажување на слободните термини.
4. Резервирање термин со име и email.
5. Спречување на двојна резервација на ист термин.
6. Чување на сите термини и резервации во PostgreSQL.
7. Страница за потврда на успешна резервација.
8. Опционална AI-генерирана порака за потврда преку Gemini API.
9. Валидација на влезните податоци.
10. Тестови за backend, frontend и најважните кориснички текови.
11. Документација и подготовка за deployment.

**Основно правило:** апликацијата не смее само визуелно да симулира функционалност. Сите главни операции мора да работат преку реален API и PostgreSQL база.

## 2. Технологии

| Дел | Технологија | Намена |
|---|---|---|
| Frontend | React | UI и компоненти |
| Јазик | TypeScript | Типизација |
| Frontend tooling | Vite | Развој и production build |
| Routing | React Router | Навигација меѓу страниците |
| UI | Tailwind CSS + shadcn/ui | Дизајн и компоненти |
| Backend | Node.js + Express | REST API и бизнис логика |
| Database | PostgreSQL | Перзистентно чување податоци |
| ORM | Prisma | Database queries и migrations |
| Validation | Zod | Валидација на request-ови |
| Backend tests | Jest + Supertest | API и интеграциски тестови |
| Frontend tests | Vitest + React Testing Library | Тестирање на React компоненти |
| E2E tests | Playwright | Тестирање на целосен кориснички тек |
| Local database | Docker Compose | Локално PostgreSQL опкружување |
| AI | Gemini API | Генерирање порака за потврда |
| Deployment | Vercel + Render или еквивалент | Објавување на апликацијата |

Не користи NestJS. Backend архитектурата треба да биде базирана на Express со routes, controllers, services и middleware.

## 3. Архитектура на апликацијата

Апликацијата ќе биде организирана како monorepo со одделни frontend и backend директориуми.

```text
mentormeet/
├── frontend/
├── backend/
├── docs/
├── docker-compose.yml
├── package.json
├── .gitignore
├── .editorconfig
└── README.md
```

### Како комуницираат деловите?

1. Корисникот отвора React страница.
2. React испраќа HTTP барање до Express API.
3. Express го валидира барањето.
4. Service слојот ја извршува бизнис логиката.
5. Prisma комуницира со PostgreSQL.
6. Backend враќа JSON response.
7. Frontend го прикажува резултатот.

Пример за резервација:

```text
Visitor
   |
   v
React Booking Form
   |
   | POST /api/bookings
   v
Express Route
   |
   v
Controller
   |
   v
Booking Service
   |
   v
Prisma Transaction
   |
   v
PostgreSQL
   |
   v
Booking Confirmation
```

### Backend слоеви

- **Routes:** дефинираат API endpoint-и.
- **Controllers:** ги обработуваат HTTP request-овите и response-овите.
- **Services:** ја содржат бизнис логиката.
- **Schemas:** ги валидираат податоците.
- **Middleware:** обработува грешки, валидација и rate limiting.
- **Prisma:** овозможува пристап до базата.

Не ја ставај целата логика во `server.ts` или во controller-и.

## 4. Структура на фајловите

Claude Code прво мора да го провери постојниот проект. Ако веќе постојат соодветни фајлови, треба да ги измени наместо непотребно да ги презапишува.

### 4.1 Root директориум

```text
mentormeet/
├── package.json
├── .gitignore
├── .editorconfig
├── docker-compose.yml
├── README.md
├── frontend/
├── backend/
└── docs/
    ├── architecture.md
    └── api.md
```

**Намена:**

- `package.json` — root scripts за полесно стартување, ако е соодветно.
- `.gitignore` — ги исклучува `.env`, `node_modules`, build output и други генерирани фајлови.
- `.editorconfig` — конзистентни правила за форматирање.
- `docker-compose.yml` — локална PostgreSQL база.
- `README.md` — опис, инструкции, технологии, API и deployment.
- `docs/architecture.md` — архитектура и важни технички одлуки.
- `docs/api.md` — API документација.

### 4.2 Backend фајлови

```text
backend/
├── package.json
├── tsconfig.json
├── jest.config.ts
├── .env.example
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
└── src/
    ├── app.ts
    ├── server.ts
    ├── config/
    │   └── env.ts
    ├── lib/
    │   └── prisma.ts
    ├── common/
    │   ├── http-errors.ts
    │   └── async-handler.ts
    ├── middleware/
    │   ├── error-handler.ts
    │   ├── not-found.ts
    │   └── validate-request.ts
    ├── modules/
    │   ├── slots/
    │   │   ├── slots.routes.ts
    │   │   ├── slots.controller.ts
    │   │   ├── slots.service.ts
    │   │   ├── slots.schemas.ts
    │   │   └── slots.types.ts
    │   ├── bookings/
    │   │   ├── bookings.routes.ts
    │   │   ├── bookings.controller.ts
    │   │   ├── bookings.service.ts
    │   │   └── bookings.schemas.ts
    │   └── ai/
    │       ├── ai.routes.ts
    │       ├── ai.controller.ts
    │       ├── ai.service.ts
    │       └── ai.schemas.ts
    └── utils/
        ├── date-time.ts
        └── api-response.ts
└── tests/
    ├── setup.ts
    ├── slots.integration.test.ts
    ├── bookings.integration.test.ts
    ├── bookings-concurrency.integration.test.ts
    └── ai.service.test.ts
```

**Објаснување на клучните фајлови:**

- `app.ts` — ја конфигурира Express апликацијата, middleware и routes.
- `server.ts` — го стартува HTTP server-от.
- `config/env.ts` — ги проверува environment variables.
- `lib/prisma.ts` — креира и извезува Prisma client.
- `slots.routes.ts` — ги дефинира endpoint-ите за термините.
- `slots.controller.ts` — ги обработува барањата за термините.
- `slots.service.ts` — ја содржи логиката за креирање, листање и бришење термини.
- `slots.schemas.ts` — ги валидира податоците за термините.
- `bookings.routes.ts` — ги дефинира endpoint-ите за резервации.
- `bookings.controller.ts` — ги обработува барањата за резервации.
- `bookings.service.ts` — ја содржи атомската логика за резервација.
- `ai.service.ts` — ја повикува AI услугата и обезбедува fallback.
- `error-handler.ts` — ги претвора грешките во конзистентни HTTP response-и.
- `schema.prisma` — ги дефинира моделите и релациите во базата.
- `seed.ts` — внесува примерни термини за локален развој.

Ако некоја функција не бара посебен фајл, не додавај празен фајл само затоа што се наоѓа во предложената структура.

### 4.3 Frontend фајлови

```text
frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── app/
    │   └── router.tsx
    ├── components/
    │   ├── layout/
    │   │   ├── AppLayout.tsx
    │   │   ├── Sidebar.tsx
    │   │   └── PageHeader.tsx
    │   ├── slots/
    │   │   ├── SlotCard.tsx
    │   │   ├── SlotList.tsx
    │   │   ├── SlotCalendar.tsx
    │   │   ├── CreateSlotDialog.tsx
    │   │   └── DeleteSlotDialog.tsx
    │   ├── bookings/
    │   │   ├── BookingForm.tsx
    │   │   ├── BookingCard.tsx
    │   │   └── UpcomingBookings.tsx
    │   └── common/
    │       ├── LoadingState.tsx
    │       ├── ErrorState.tsx
    │       ├── EmptyState.tsx
    │       └── ConfirmDialog.tsx
    ├── features/
    │   ├── dashboard/
    │   │   ├── DashboardPage.tsx
    │   │   └── dashboard.api.ts
    │   ├── public-booking/
    │   │   ├── BookingPage.tsx
    │   │   └── booking.api.ts
    │   └── confirmation/
    │       ├── ConfirmationPage.tsx
    │       └── confirmation.api.ts
    ├── lib/
    │   ├── api-client.ts
    │   ├── date-time.ts
    │   └── validation.ts
    ├── types/
    │   ├── slot.ts
    │   └── booking.ts
    └── test/
        ├── setup.ts
        ├── BookingForm.test.tsx
        ├── BookingPage.test.tsx
        └── ConfirmationPage.test.tsx
```

**Објаснување:**

- `main.tsx` — влезна точка на React.
- `App.tsx` — главната апликациска компонента.
- `router.tsx` — ги дефинира страниците и URL патеките.
- `DashboardPage.tsx` — dashboard за host.
- `BookingPage.tsx` — јавна страница за избор и резервирање термин.
- `ConfirmationPage.tsx` — страница за потврда на резервација.
- `api-client.ts` — централизирана логика за повикување на backend.
- `BookingForm.tsx` — форма за име и email.
- `SlotCard.tsx` — прикажување на еден термин.
- `CreateSlotDialog.tsx` — форма за креирање термин.
- `UpcomingBookings.tsx` — прикажување на претстојни резервации.

Фајловите за UI можат да се приспособат според реалниот дизајн, но страниците, API логиката и типовите треба да бидат јасно организирани.

## 5. Модел на базата на податоци

Ќе се користат две главни табели: `TimeSlot` и `Booking`.

### TimeSlot

Претставува еден временски термин што може да се резервира.

Полиња:

- `id` — UUID, primary key.
- `startTime` — датум и време на почеток.
- `endTime` — датум и време на крај.
- `status` — `AVAILABLE`, `BOOKED` или `CANCELLED`.
- `createdAt` — време на креирање.
- `updatedAt` — време на последна промена.

### Booking

Претставува резервација на еден термин.

Полиња:

- `id` — UUID, primary key.
- `timeSlotId` — foreign key кон `TimeSlot`, со `UNIQUE` constraint.
- `name` — име на посетителот.
- `email` — email на посетителот.
- `status` — `CONFIRMED` или `CANCELLED`.
- `confirmationToken` — случаен, тешко погодлив токен за јавната confirmation страница.
- `createdAt`.
- `updatedAt`.

### Релација

Еден `TimeSlot` може да има најмногу една `Booking`.

Ако слотот е резервиран, во базата мора да постои соодветна резервација. Промената на статусот и креирањето на резервацијата мора да бидат дел од истата трансакција.

### Database constraints

Мора да постојат:

1. Primary keys.
2. Foreign key меѓу `Booking` и `TimeSlot`.
3. `UNIQUE` constraint на `Booking.timeSlotId`.
4. Проверка дека почетното време е пред крајното.
5. Заштита од преклопување на слотови.
6. Индекси за ефикасно пребарување по статус и време.

За PostgreSQL, преклопувањето треба да биде заштитено на ниво на базата, на пример со exclusion constraint и `btree_gist` extension во custom Prisma migration. Интервалите треба да бидат half-open, `[start, end)`, што значи дека 14:00–14:30 и 14:30–15:00 се дозволени, но 14:00–14:30 и 14:15–14:45 не се дозволени.

Самата проверка во JavaScript не е доволна за конкурентни барања.

## 6. API спецификација

Сите endpoint-и ќе бидат под `/api`.

### Health check

`GET /api/health`

Враќа `200 OK` кога API е достапен.

### Креирање термин

`POST /api/slots`

Пример request:

```json
{
  "startTime": "2026-10-21T14:00:00+02:00",
  "durationMinutes": 30
}
```

Правила:

- Дозволено времетраење: 15, 30, 45 или 60 минути.
- Backend го пресметува `endTime`.
- Терминот мора да биде во иднина.
- Датумот мора да биде валиден ISO 8601 timestamp со timezone.
- Не смее да има преклопување со друг активен термин.

Responses:

- `201 Created` — успешно креиран термин.
- `400 Bad Request` — невалидни податоци.
- `409 Conflict` — термин што се преклопува со постоечки термин.

### Листање термини

`GET /api/slots?from=2026-10-01&to=2026-10-31`

Враќа термини во избраниот период, подредени по почетно време.

Јавната booking страница прикажува само идни слободни термини.

### Детали за термин

`GET /api/slots/:id`

- `200 OK` ако постои.
- `404 Not Found` ако не постои.

### Бришење термин

`DELETE /api/slots/:id`

- `204 No Content` при успех.
- `404 Not Found` ако не постои.
- `409 Conflict` ако терминот веќе има резервација.

### Креирање резервација

`POST /api/bookings`

Пример request:

```json
{
  "timeSlotId": "uuid-of-slot",
  "name": "Ana Petrova",
  "email": "ana@example.com"
}
```

Правила:

- Валидирај ги `timeSlotId`, `name` и `email`.
- Не прифаќај `status`, `startTime` или `endTime` од клиентот како авторитативни вредности.
- Провери дали терминот постои и е слободен.
- Резервирај го терминoт во атомска трансакција.
- Генерирај confirmation token.
- Врати `201 Created` со податоците за резервацијата и токенот за confirmation страницата.

Responses:

- `201 Created` — резервацијата е зачувана.
- `400 Bad Request` — невалидни податоци.
- `404 Not Found` — терминот не постои.
- `409 Conflict` — терминот веќе е резервиран.

### Потврда на резервација

`GET /api/bookings/:token`

Овој endpoint враќа само податоци потребни за confirmation страницата. Користи случаен токен што не може лесно да се погоди, наместо јавен пристап преку обичен booking ID.

### Листа на резервации

`GET /api/bookings`

Овој endpoint е наменет за host dashboard.

**Важно:** ако нема authentication, endpoint-от не е безбеден за вистинска продукција, бидејќи содржи лични податоци. Документирај го ова ограничување и не го претставувај како production-secure. Пред јавно објавување, заштити го dashboard-от и host endpoint-ите со соодветна authentication.

### AI confirmation message

`POST /api/ai/confirmation`

Backend ги зема вистинските податоци за резервацијата од базата и ги користи за генерирање порака.

Ако Gemini не е достапен, API key недостасува или барањето истече, врати однапред подготвена порака. Резервацијата веќе мора да биде зачувана и не смее да зависи од AI услугата.

### Формат на грешки

Користи конзистентен JSON формат:

```json
{
  "error": {
    "code": "SLOT_ALREADY_BOOKED",
    "message": "This time slot is no longer available."
  }
}
```

Не враќај stack traces или database internals во production.

## 7. Најважниот дел: спречување двојна резервација

Не е доволно frontend да го отстрани терминот од листата кога некој ќе го избере. Двајца посетители може да го испратат барањето речиси истовремено.

Затоа:

1. Backend започнува PostgreSQL трансакција преку Prisma.
2. Во трансакцијата се прави атомска промена на слотот од `AVAILABLE` во `BOOKED`, само ако сè уште е достапен и е во иднина.
3. Се проверува дали точно еден ред е променет.
4. Ако е, се креира `Booking` во истата трансакција.
5. Ако креирањето на резервацијата не успее, се rollback-ира целата трансакција.
6. `UNIQUE` constraint на `Booking.timeSlotId` е дополнителна заштита.
7. Ако друг request веќе го резервирал слотот, се враќа `409 Conflict`.

Мора да постои интеграциски тест што испраќа две или повеќе паралелни барања за истиот слот.

**Очекуван резултат:** точно едно барање успева, останатите добиваат `409`, а во базата постои само една резервација за тој слот.

Исто така, тестирај паралелно креирање на преклопени слотови.

## 8. Датуми и временски зони

- Користи `Europe/Skopje` за прикажување на датумите и времињата.
- Зачувај timestamps со јасна временска зона во PostgreSQL.
- Прифаќај ISO 8601 timestamps со offset или `Z`.
- Не претпоставувај дека серверот е во истата временска зона како корисникот.
- Не додавај рачно часови за да ја симулираш временската зона.
- Користи соодветна библиотека за date-time операции ако е потребна.
- Тестирај гранични случаи поврзани со датумите и летното/зимското сметање на времето.

## 9. Frontend страници

### 9.1 Dashboard — `/dashboard`

Dashboard-от треба да содржи:

- Navigation/sidebar.
- Статистички картички.
- Слободни термини.
- Календар или листа на термини по датум.
- Форма за креирање термин.
- Опција за бришење слободен термин.
- Листа на претстојни резервации.

Мора да има loading, empty, error и success состојби.

Податоците мора да се добиваат од API, а не да бидат хардкодирани во UI.

### 9.2 Јавна booking страница — `/book`

Корисникот треба да може:

1. Да избере датум.
2. Да види слободни термини.
3. Да избере термин.
4. Да внесе име и email.
5. Да ја потврди резервацијата.
6. Да биде пренасочен кон confirmation страницата.

За време на испраќање на барањето, оневозможи повторно submit-ирање.

Ако API врати `409 Conflict`, освежи ги достапните термини и прикажи разбирлива порака.

### 9.3 Confirmation страница — `/booking/confirmation/:token`

Прикажи:

- Име на посетителот.
- Датум и време на сесијата.
- Времетраење.
- Потврда дека резервацијата е зачувана.
- AI порака или fallback порака.

Страницата мора да ги вчита податоците од backend по token. Ако корисникот ја освежи страницата, податоците не смеат да исчезнат.

Обезбеди loading, invalid-token и network-error состојби.

## 10. Environment variables

### `backend/.env.example`

```env
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mentormeet?schema=public"
FRONTEND_URL="http://localhost:5173"
GEMINI_API_KEY=""
```

### `frontend/.env.example`

```env
VITE_API_BASE_URL="http://localhost:3000/api"
```

Вистинските credentials мора да бидат во `.env`, кој е исклучен од Git.

Gemini API key мора да биде само на backend. Никогаш не го ставај во `VITE_` променлива, бидејќи frontend environment variables се достапни во browser bundle.

## 11. Docker и локално стартување

`docker-compose.yml` треба да стартува PostgreSQL за локален развој.

Потребно е да содржи:

- PostgreSQL image.
- Database `mentormeet`.
- Username/password за локален развој.
- Persistent volume.
- Health check.

README треба да ги содржи вистинските команди за:

1. Инсталирање dependencies.
2. Креирање `.env` од `.env.example`.
3. Стартување на PostgreSQL.
4. Генерирање Prisma Client.
5. Примена на миграциите.
6. Seed на развојни термини.
7. Стартување на backend.
8. Стартување на frontend.
9. Извршување тестови.
10. Production build.

Командите во README мора да одговараат на реалните scripts во `package.json`.

## 12. Безбедност

- Валидирај ги сите влезни податоци на backend.
- Користи CORS со конфигуриран frontend origin.
- Додај rate limiting за јавните booking и AI endpoint-и.
- Ограничувај ја големината на JSON request body.
- Не логирај email адреси, confirmation tokens или API keys.
- Не враќај stack traces во production.
- Не ги изложувај Prisma error деталите кон клиентот.
- Не дозволувај бришење на резервиран термин.
- Не изложувај host dashboard како безбеден јавен endpoint без authentication.

## 13. План по фази

### Фаза 0 — Repository inspection

- Прегледај ги постојните фајлови и директориуми.
- Провери ги зависностите и scripts.
- Провери дали проектот веќе содржи React, Express или база.
- Направи список на фајлови што треба да се креираат или изменат.
- Не презапишувај постоечки код без претходен преглед.

**Критериум за завршување:** јасен план за структурата и зависностите.

### Фаза 1 — Основна поставка

- Конфигурирај Express со TypeScript.
- Направи `app.ts` и `server.ts`.
- Додај `/api/health`.
- Додај CORS и JSON middleware.
- Додај 404 и централен error handler.
- Додај environment validation.
- Постави Docker Compose за PostgreSQL.
- Конфигурирај frontend и backend scripts.

**Критериум за завршување:** апликацијата се стартува, health endpoint работи, а lint/build/test командите се валидни.

### Фаза 2 — База и Prisma

- Креирај `TimeSlot` и `Booking` модели.
- Додај enums, релации, индекси и constraints.
- Креирај Prisma migrations.
- Додај DB-level заштита од преклопување.
- Направи seed скрипта.

**Критериум за завршување:** миграциите успешно се применуваат на чиста PostgreSQL база.

### Фаза 3 — Slots API

- Креирај routes, controllers, services и validation schemas.
- Имплементирај create/list/get/delete.
- Провери времетраење, датуми и преклопување.
- Додај интеграциски тестови.

**Критериум за завршување:** сите slot операции работат со реална база и невалидните барања се одбиваат.

### Фаза 4 — Bookings API

- Имплементирај атомска резервација.
- Генерирај confirmation token.
- Додај confirmation endpoint.
- Додај host booking list endpoint и документирај ја неговата заштита.
- Тестирај rollback и конкурентни барања.

**Критериум за завршување:** невозможно е двајца корисници да резервираат ист слот.

### Фаза 5 — Frontend

- Имплементирај dashboard.
- Имплементирај јавна booking страница.
- Имплементирај confirmation страница.
- Поврзи ги сите страници со backend.
- Додај loading, error, empty и success состојби.
- Напиши frontend тестови.

**Критериум за завршување:** целиот главен кориснички тек работи со вистински податоци од PostgreSQL.

### Фаза 6 — AI интеграција

- Додај Gemini integration на backend.
- Додај timeout и fallback порака.
- Тестирај сценарија без API key и со provider error.

**Критериум за завршување:** AI грешка не влијае на веќе зачуваната резервација.

### Фаза 7 — Финални тестови и документација

- Изврши backend и frontend тестови.
- Изврши lint и production build.
- Додај E2E тест ако е изводливо.
- Заврши README и API документација.
- Провери дека нема тајни во Git.

**Критериум за завршување:** чист clone може да се постави според README и главните функционалности се тестирани.

### Фаза 8 — Deployment

- Deploy backend.
- Постави production PostgreSQL.
- Примени миграции.
- Конфигурирај environment variables и CORS.
- Deploy frontend.
- Тестирај го live booking flow.
- Додај live URL во README.

**Критериум за завршување:** live апликацијата работи и податоците остануваат зачувани по refresh и нови барања.

## 14. Тест план

### Backend

- Креирање валиден термин.
- Одбивање термин во минатото.
- Одбивање неподдржано времетраење.
- Одбивање преклопени термини.
- Листање и бришење термини.
- Одбивање бришење на резервиран термин.
- Успешна резервација.
- Одбивање непостоечки термин.
- Одбивање веќе резервиран термин.
- Rollback ако креирањето на резервацијата не успее.
- Паралелни барања за ист слот.
- Паралелно креирање преклопени слотови.
- Невалиден confirmation token.
- AI fallback и timeout.

### Frontend

- Прикажување достапни термини.
- Валидација на име и email.
- Loading и empty states.
- Прикажување API грешки.
- Успешна резервација.
- Обработка на `409 Conflict`.
- Confirmation страница по refresh.

### E2E

1. Обезбеди иден слободен термин.
2. Отвори `/book`.
3. Избери термин.
4. Пополни име и email.
5. Резервирај.
6. Провери confirmation страница.
7. Провери дека терминот веќе не е достапен.
8. Обиди се повторно да го резервираш и очекувај `409 Conflict`.

