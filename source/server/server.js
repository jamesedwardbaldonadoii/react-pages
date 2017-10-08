import koa from 'koa'

import render_page from './render'
import { get_preferred_locales } from './locale'
import render_stack_trace from './stack trace'

import timer from '../timer'

export default function server(settings, options)
{
	const
	{
		assets,
		localize,
		proxy,
		authentication,
		render,
		loading,
		stats,
		html,
		initialize
	}
	= options

	const application = new koa()

	// Handles errors
	application.use(async (ctx, next) =>
	{
		try
		{
			await next()
		}
		catch (error)
		{
			// if the error is caught here it means that `catch`
			// (error handler parameter) didn't resolve it
			// (or threw it)

			// show error stack trace in development mode for easier debugging
			if (process.env.NODE_ENV !== 'production')
			{
				try
				{
					const { status, content } = render_stack_trace(error, options.print_error)

					if (content)
					{
						ctx.status = status || 500
						ctx.type = 'html'
						ctx.body = content

						return
					}
				}
				catch (error)
				{
					console.log('(couldn\'t render error stack trace)')
					console.log(error.stack || error)
				}
			}

			// log the error
			console.log('[react-isomorphic-render] Webpage rendering server error')

			if (options.log)
			{
				options.log.error(error)
			}

			ctx.status = typeof error.status === 'number' ? error.status : 500
			ctx.message = error.message || 'Internal error'
		}
	})

	// Custom Koa middleware extension point
	// (if someone ever needs this)
	if (options.middleware)
	{
		for (let middleware of options.middleware)
		{
			application.use(middleware)
		}
	}

	// Isomorphic rendering
	application.use(async (ctx) =>
	{
		// Trims a question mark in the end (just in case)
		const url = ctx.request.originalUrl.replace(/\?$/, '')

		const total_timer = timer()

		const { status, content, redirect, route, time, afterwards } = await render_page(settings,
		{
			proxy,
			assets,
			initialize,
			localize: localize ? parameters => localize(parameters, get_preferred_locales(ctx)) : undefined,
			render,
			loading,
			html,
			authentication,

			// The original HTTP request can be required
			// for inspecting cookies in `preload` function
			request: ctx.req,

			// Cookies for protected cookie value retrieval
			cookies: ctx.cookies
		})

		// Can add `Set-Cookie` headers, for example.
		if (afterwards)
		{
			afterwards(ctx)
		}

		// If a redirect happened perform an HTTP redirect
		if (redirect)
		{
			return ctx.redirect(redirect)
		}

		// HTTP response status
		ctx.status = status || 200

		// HTTP response "Content-Type"
		ctx.type = 'html'

		// Stream the rendered React page
		ctx.body = content

		// Report page rendering stats
		if (stats)
		{
			stats
			({
				url: ctx.path + (ctx.querystring ? `?${ctx.querystring}` : ''),
				route,
				time:
				{
					...time,
					total: total_timer()
				}
			})
		}
	})

	return application
}