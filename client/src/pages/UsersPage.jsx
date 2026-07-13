import { useState, useEffect } from 'react';
import { UserPlus, MoreHorizontal, Search } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import DataTable from '../components/Tables/DataTable';
import StatusBadge from '../components/Cards/StatusBadge';
import api from '../services/api';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/users');
        setUsers(res.data);
      } catch (error) {
        toast.error('Failed to load users');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(user => 
    user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      key: 'avatar', label: '',
      render: (row) => (
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center text-white text-xs font-bold">
          {row.fullName.charAt(0).toUpperCase()}
        </div>
      ),
    },
    { key: 'fullName', label: 'Name' },
    { key: 'email', label: 'Email' },
    { 
      key: 'role', label: 'Role',
      render: (row) => <span className={`uppercase text-[10px] tracking-wider font-bold ${row.role === 'admin' ? 'text-danger-400' : 'text-primary-400'}`}>{row.role}</span>
    },
    {
      key: 'status', label: 'Status',
      render: (row) => <StatusBadge label={row.status} variant={row.status === 'Active' ? 'success' : 'danger'} dot />,
    },
    {
      key: 'lastLogin', label: 'Last Login',
      render: (row) => <span className="text-xs text-gray-500">{row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : 'Never'}</span>
    },
    {
      key: 'action', label: '',
      render: () => (
        <button className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 transition-colors">
          <MoreHorizontal size={16} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="User Management" subtitle="Manage users, roles, and access" breadcrumb={['TrueView AI', 'Users']}
        actions={<button className="btn-primary flex items-center gap-2 text-sm"><UserPlus size={15} />Add User</button>}
      />
      
      <div className="glass p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search by name or email..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-glass pl-9 text-sm w-full" 
          />
        </div>
        <select className="input-glass max-w-[140px] text-sm">
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <select className="input-glass max-w-[140px] text-sm">
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <div className="glass p-12 flex justify-center"><LoadingSpinner /></div>
      ) : (
        <DataTable columns={columns} data={filteredUsers} />
      )}
    </div>
  );
}
