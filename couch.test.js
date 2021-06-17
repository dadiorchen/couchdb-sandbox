const supertest = require("supertest");
const log = require("loglevel");
const PouchDB = require("PouchDB");

describe("CouchDB", () => {

  const adminUrl = "http://admin:admin@localhost:5984";
  const normalUrl = "http://localhost:5984";
  const dbName = "test_db";


  beforeEach(async () => {
    await supertest(adminUrl).del(`/${dbName}`);
    await supertest(adminUrl).del(`/_users`);
  });
  


  it("create db", async () => {
    let res = await supertest(adminUrl).get("/")
      .expect(200);
    log.warn("res:", res.body);
    expect(res).toHaveProperty("statusCode", 200);
    expect(res.body).toHaveProperty("couchdb", "Welcome");

    // initial db
    res = await supertest(adminUrl).get(`/_all_dbs`)
      .expect(200);
    expect(res.body).toMatchObject([]);

    // create db
    res = await supertest(adminUrl).put(`/${dbName}`)
      .expect(201);

    // insert a doc
    res = await supertest(adminUrl).put(`/${dbName}/doc1`)
      .send({
        content: "text",
      })
      .expect(201);

    // read doc
    res = await supertest(adminUrl).get(`/${dbName}/doc1`)
      .set('Accept', 'application/json')
      .expect(200);
    // TODO don't know why here is text rather than json 
    expect(JSON.parse(res.text)).toMatchObject({
      content: "text", 
    });

    // create _users
    res = await supertest(adminUrl)
      .put(`/_users`)
      .expect(201);

    // create a user
    const userName = "237769247";
    res = await supertest(adminUrl)
      .put(`/_users/org.couchdb.user:${userName}`)
      .send({
        name: userName,
        password: "123456",
        roles: [],
        type: "user",
      })
      .expect(201);

    // user has no permission 
    let pouchdb = new PouchDB(
      `${normalUrl}/${dbName}`,
      {
    });
    await expect(async () => {
      await pouchdb.get("doc1")
    }).rejects.toMatchObject({status:401});

    // assign permission
    const testDBWithAdmin = new PouchDB(
      `${adminUrl}/${dbName}`
    );
    res = await supertest(adminUrl)
      .put(`/${dbName}/_security`)
      .send(
        {
          "admins": {
            "names": [
              "superuser"
            ],
            "roles": [
              "admins"
            ]
          },
          "members": {
            "names": [
              userName
            ],
            "roles": [
              "developers"
            ]
          }
        }
      )
      .expect(200);

    // user has permission 
    //curl -X POST http://localhost:5984/_session -d 'name=jan&password=apple'
    res = await supertest(normalUrl)
      .post(`/_session/`)
      .send({
        name: userName,
        password: "123456",
      })
      .expect(200);
    // pouchdb
    pouchdb = new PouchDB(
      `${normalUrl}/${dbName}`,
      {
        auth: {
          username: userName,
          password: "123456",
        },
    });
    res = await pouchdb.get("doc1")
    expect(res).toMatchObject({
      content: "text",
    });

    // get user data
    res = await supertest(adminUrl)
      .get(`/_users/org.couchdb.user:${userName}`)
      .expect(200);
    expect(res.body).toMatchObject({
      "_rev": expect.stringMatching(/\d.*/),
    });
    log.debug("User info 1:", res.body);


    // change password
    res = await supertest(adminUrl)
      .put(`/_users/org.couchdb.user:${userName}`)
      .set("If-Match", res.body._rev)
      .send({
        "name": userName,
        "password": "654321",
        "roles": [],
        "type": "user",
      })
      .expect(201);
    expect(res.body).toMatchObject({
      ok: true,
      rev: expect.stringMatching(/^2-\w+$/),
    });

    res = await supertest(adminUrl)
      .get(`/_users/org.couchdb.user:${userName}`)
      .expect(200);
    expect(res.body).toMatchObject({
      "_rev": expect.stringMatching(/\d.*/),
    });
    log.debug("User info 2:", res.body);

    await new Promise(r => setTimeout(() => r(), 1000));

    // user has no permission 
    // TODO change password doesn't work
    res = await supertest(normalUrl)
      .post(`/_session/`)
      .send({
        name: userName,
        password: "123456",
      })
      .expect(200);
    let pouchdb2 = new PouchDB(
      `${normalUrl}/${dbName}`,
      {
        auth: {
          username: userName,
          password: "123456",
        },
    });
    let res2 = await pouchdb2.get("doc1")
    expect(res2).toMatchObject({
      content: "text",
    });


    // delete db
    res = await supertest(adminUrl).del(`/${dbName}`)
      .expect(200);

  });
});
