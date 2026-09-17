window.__ModuleLoader__.load({
  id: 'sidemind',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    const inject = ['slots', 'commandUi', 'sidebarRightTabs', 'sidebarRight']

    function SidePlaceholder() {
      return React.createElement('div', {
        style: { padding: 16, fontSize: 13, lineHeight: 1.55, color: 'var(--dsw-alias-label-secondary)' },
      }, 'SideMind side conversation transport is being connected. This tab is ephemeral and will be destroyed when closed.')
    }

    function apply(ctx) {
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: 'sidemind/side',
        kind: 'sidemind-side',
        multiple: true,
        priority: 'extension',
        title: () => 'SideMind',
      }), 'sidemind: side tab type')

      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          id: 'sidemind/side',
          key: 'sidemind/side',
        }, SidePlaceholder),
      )

      ctx.effect(() => ctx.commandUi.register({
        name: 'side',
        label: () => 'SideMind',
        description: () => 'Open a temporary side conversation',
        available: () => true,
        ui: {
          kind: 'action',
          run: () => ctx.sidebarRight.openTab('sidemind-side'),
        },
      }), 'sidemind: /side action')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
