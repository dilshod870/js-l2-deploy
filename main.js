'use strict';

const http = require('http');
const mysqlx = require('@mysql/xdevapi');

const port = process.env.PORT || 9999;
const statusOk = 200;
const statusBadRequest = 400;
const statusNotFound = 404;
const statusInternalServerError = 500;
const schema = 'social';

const client = mysqlx.getClient({
    user: 'app',
    password: 'pass',
    host: '127.0.0.1',
    port: 33060
});

function sendResponse(response, { status = statusOk, headers = {}, body = null }) {
    Object.entries(headers).forEach(function ([key, value]) {
        response.setHeader(key, value);
    });
    response.writeHead(status);
    response.end(body);
}

function sendJSON(response, body) {
    sendResponse(response, {
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

function map(columns) {
    return row => row.reduce((res, value, i) => ({ ...res, [columns[i].getColumnLabel()]: value }), {});
}

const methods = new Map();

methods.set('/posts.get', async ({ response, db }) => {
    const table = await db.getTable('posts');
    const result = await table.select(['id', 'content', 'likes', 'created'])
        .where('removed=false')
        .orderBy('id DESC')
        .execute();

    const data = result.fetchAll();
    const columns = result.getColumns();
    const posts = data.map(map(columns));
    sendJSON(response, posts);
});

methods.set('/posts.getById', async ({ response, searchParams, db }) => {
    if (!searchParams.has('id')) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const postId = Number(searchParams.get('id'));
    if (Number.isNaN(postId)) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const table = await db.getTable('posts');
    const result = await table.select(['id', 'content', 'likes', 'created'])
        .where('id=:id and removed=false')
        .bind('id', postId)
        .execute();

    const data = result.fetchAll();

    if (data.length === 0) {
        sendResponse(response, {
            status: statusNotFound,
            body: 'page not found'
        });
        return;
    }

    const columns = result.getColumns();
    const post = data.map(map(columns));
    sendJSON(response, post[0]);

});

methods.set('/posts.post', async ({ response, searchParams, db }) => {
    if (!searchParams.has('content')) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const content = searchParams.get('content');

    const table = await db.getTable('posts');
    const result = await table.insert('content').values(content).execute();
    const postId = result.getAutoIncrementValue();

    const newPost = await table.select(['id', 'content', 'likes', 'created'])
        .where('id=:id')
        .bind('id', postId)
        .execute();

    const data = newPost.fetchAll();
    const columns = newPost.getColumns();
    const post = data.map(map(columns))[0];

    sendJSON(response, post);
});

methods.set('/posts.edit', async ({ response, searchParams, db }) => {
    if (!searchParams.has('id') || !searchParams.has('content')) {
        sendResponse(response, {
            status: statusBadRequest,
            body: 'bad request',
        });
        return;
    }

    const id = Number(searchParams.get('id'));
    const content = searchParams.get('content');

    if (Number.isNaN(id) || !content.trim()) {
        sendResponse(response, {
            status: statusBadRequest,
            body: 'bad request',
        });
        return;
    }

    const table = await db.getTable('posts');
    const result = await table.update()
        .set('content', content)
        .where('id=:id and removed=false')
        .bind('id', id)
        .execute();

    if (result.getAffectedItemsCount() === 0) {
        sendResponse(response, {
            status: statusNotFound,
            body: 'page not found',
        });
        return;
    }

    const updatePost = await table.select(['id', 'content', 'likes', 'created'])
        .where('id=:id')
        .bind('id', id)
        .execute();

    const data = updatePost.fetchAll();
    const columns = updatePost.getColumns();
    const post = data.map(map(columns))[0];

    sendJSON(response, post);

});

methods.set('/posts.delete', async ({ response, searchParams, db }) => {
    if (!searchParams.has('id')) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const id = Number(searchParams.get('id'));
    if (Number.isNaN(id)) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const table = await db.getTable('posts');
    const result = await table.update()
        .set('removed', true)
        .where('id=:id and removed=false')
        .bind('id', id)
        .execute();

    const removed = result.getAffectedItemsCount();

    if (removed === 0) {
        sendResponse(response, { status: statusNotFound });
        return;
    }

    const removedPost = await table.select(['id', 'content', 'likes', 'created'])
        .where('id=:id')
        .bind('id', id)
        .execute();

    const data = removedPost.fetchAll();
    const columns = removedPost.getColumns();
    const post = data.map(map(columns))[0];

    sendJSON(response, post);
});

methods.set('/posts.restore', async ({ response, searchParams, db }) => {
    if (!searchParams.has('id')) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const id = Number(searchParams.get('id'));
    if (Number.isNaN(id)) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const table = await db.getTable('posts');
    const result = await table.update()
        .set('removed', false)
        .where('id=:id and removed=true')
        .bind('id', id)
        .execute();

    const removed = result.getAffectedItemsCount();

    if (removed === 0) {
        sendResponse(response, { status: statusNotFound });
        return;
    }

    const removedPost = await table.select(['id', 'content', 'likes', 'created'])
        .where('id=:id')
        .bind('id', id)
        .execute();

    const data = removedPost.fetchAll();
    const columns = removedPost.getColumns();
    const post = data.map(map(columns))[0];

    sendJSON(response, post);

});


methods.set('/posts.like', async ({ response, searchParams, db }) => {
    if (!searchParams.has('id')) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const id = Number(searchParams.get('id'));
    if (Number.isNaN(id)) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const table = await db.getTable('posts');
    const getPost = await table.select(['likes'])
        .where('id=:id and removed=false')
        .bind('id', id)
        .execute();
    const result = getPost.fetchAll();
    if (result.length === 0) {
        sendResponse(response, {
            status: statusNotFound,
            body: 'page not found'
        });
        return;
    }

    const columnsPost = getPost.getColumns();
    const likesPost = result.map(map(columnsPost))[0];
    
    await table.update()
        .set('likes', ++likesPost.likes)
        .where('id=:id and removed=false')
        .bind('id', id)
        .execute();

    const likePost = await table.select(['id', 'content', 'likes', 'created'])
        .where('id=:id')
        .bind('id', id)
        .execute();

    const data = likePost.fetchAll();
    const columns = likePost.getColumns();
    const post = data.map(map(columns))[0];

    sendJSON(response, post);
});

methods.set('/posts.dislike', async ({ response, searchParams, db }) => {
    if (!searchParams.has('id')) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const id = Number(searchParams.get('id'));
    if (Number.isNaN(id)) {
        sendResponse(response, { status: statusBadRequest });
        return;
    }

    const table = await db.getTable('posts');
    const getPost = await table.select(['id', 'content', 'likes', 'created'])
        .where('id=:id and removed=false')
        .bind('id', id)
        .execute();
    const result = getPost.fetchAll();
    if (result.length === 0) {
        sendResponse(response, {
            status: statusNotFound,
            body: 'page not found'
        });
        return;
    }

    const columnsPost = getPost.getColumns();
    const likesPost = result.map(map(columnsPost))[0];
    
    const like = likesPost.likes > 0 ? --likesPost.likes : 0; 
    
    await table.update()
        .set('likes', like)
        .where('id=:id and removed=false')
        .bind('id', id)
        .execute();

    const likePost = await table.select(['id', 'content', 'likes', 'created'])
        .where('id=:id')
        .bind('id', id)
        .execute();

    const data = likePost.fetchAll();
    const columns = likePost.getColumns();
    const post = data.map(map(columns))[0];

    sendJSON(response, post);
});

const server = http.createServer(async (request, response) => {
    const { pathname, searchParams } = new URL(request.url, `http://${request.headers.host}`);

    const method = methods.get(pathname);
    if (method === undefined) {
        sendResponse(response, { status: statusNotFound });
        return;
    }

    let session = null;
    try {
        session = await client.getSession();
        const db = await session.getSchema(schema);

        const params = {
            request,
            response,
            pathname,
            searchParams,
            db,
        };

        await method(params);
    } catch (e) {
        sendResponse(response, { status: statusInternalServerError, body: JSON.stringify(e) });
    } finally {
        if (session !== null) {
            try {
                await session.close();
            } catch (e) {
                console.log(e);
            }
        }
    }
});

server.listen(port);
