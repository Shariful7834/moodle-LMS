import { useState } from 'react';
import { searchStudents, getStudentCredentials } from '../services/api';
import { Search, User, Award, ChevronRight, ArrowLeft } from 'lucide-react';

export default function SearchStudents() {
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentCreds, setStudentCreds] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (query.length < 2) return;
    setLoading(true);
    setSelectedStudent(null);
    try {
      const res = await searchStudents(query);
      setStudents(res.data.students || []);
      setSearched(true);
    } catch { setStudents([]); }
    finally { setLoading(false); }
  };

  const viewStudent = async (student) => {
    setDetailLoading(true);
    try {
      const res = await getStudentCredentials(student.id);
      setSelectedStudent(res.data.student);
      setStudentCreds(res.data.credentials || []);
    } catch {}
    finally { setDetailLoading(false); }
  };

  if (selectedStudent) {
    return (
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          onClick={() => setSelectedStudent(null)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Search
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xl">
              {selectedStudent.name?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{selectedStudent.name}</h1>
              <p className="text-sm text-gray-500">{selectedStudent.email}</p>
              {selectedStudent.studentId && (
                <p className="text-sm text-gray-400 mt-0.5">Enrollment: {selectedStudent.studentId}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">Credentials ({studentCreds.length})</h2>
          </div>
          {studentCreds.length === 0 ? (
            <div className="text-center py-12">
              <Award className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No credentials found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {studentCreds.map(cred => (
                <div key={cred.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{cred.achievementName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Issued by: {cred.issuerName}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span>{new Date(cred.issuedDate).toLocaleDateString()}</span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                          {cred.source === 'claim' ? 'From Announcement' : 'Uploaded'}
                        </span>
                        {cred.shareApproved && (
                          <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">Shareable</span>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded">
                      OB 3.0
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Search Students</h1>
        <p className="text-gray-500 text-sm mt-1">Search by enrollment number, email, or name to view student achievements</p>
      </div>

      <form onSubmit={handleSearch} className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Enter enrollment number, email, or student name..."
              className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || query.length < 2}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            Search
          </button>
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
      ) : searched && students.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No students found</p>
          <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
        </div>
      ) : students.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {students.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => viewStudent(s)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition text-left"
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-semibold text-sm">
                  {s.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.email} {s.studentId ? `• ${s.studentId}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{s.credentialCount} credential{s.credentialCount !== 1 ? 's' : ''}</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
